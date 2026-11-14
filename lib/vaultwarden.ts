import { createCipheriv, createHmac, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import type { VaultLink } from "./types";

/**
 * Vaultwarden accounts for staff.
 *
 * The vault is a separate service, so "linking" means: register the person's
 * address on the vault with the password the console already knows, then keep
 * the vault's user id on the staff record. No master key or vault secret is
 * ever stored here — the password is used once to derive what Bitwarden's
 * registration endpoint expects, and the profile id is all the console keeps.
 *
 * Registration is only possible while the vault allows sign-ups, which this
 * deployment does. Every failure is soft: the console account is created either
 * way and the activity trail says what happened.
 */

const KDF_ITERATIONS = 600_000;

export interface VaultResult {
  ok: boolean;
  vault?: VaultLink;
  error?: string;
}

export function vaultUrl(): string {
  return (process.env.VAULTWARDEN_URL || "https://vault.innotel.us").replace(/\/+$/, "");
}

export function vaultEnabled(): boolean {
  return process.env.VAULTWARDEN_DISABLE !== "1" && Boolean(vaultUrl());
}

/** Bitwarden's master key: PBKDF2 over the address as salt. */
function masterKey(password: string, email: string): Buffer {
  return pbkdf2Sync(password.normalize("NFKC"), email.trim().toLowerCase(), KDF_ITERATIONS, 32, "sha256");
}

/** The value the server stores and compares at sign-in. */
function masterPasswordHash(key: Buffer, password: string): string {
  return pbkdf2Sync(key, password.normalize("NFKC"), 1, 32, "sha256").toString("base64");
}

/** HKDF-Expand with SHA-256 for one 32-byte block ("enc" / "mac"). */
function expand(ikm: Buffer, info: string): Buffer {
  const prk = createHmac("sha256", Buffer.alloc(0)).update(ikm).digest();
  return createHmac("sha256", prk).update(Buffer.concat([Buffer.from(info, "utf8"), Buffer.from([1])])).digest();
}

/** AesCbc256_HmacSha256_B64, the string Bitwarden expects in `key`. */
function encryptedUserKey(encKey: Buffer, macKey: Buffer): string {
  const userKey = randomBytes(64);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(userKey), cipher.final()]);
  const mac = createHmac("sha256", macKey).update(iv).update(ciphertext).digest();
  return `2.${iv.toString("base64")}|${ciphertext.toString("base64")}|${mac.toString("base64")}`;
}

/**
 * Vaultwarden 1.37 dropped the legacy register route. Registration now finishes
 * at /identity/accounts/register/finish; when the vault asks for a verified
 * address it hands back a short-lived token from send-verification-email, which
 * needs no SMTP when mail is off.
 */
async function verificationToken(email: string, name: string): Promise<string | null> {
  const response = await fetch(`${vaultUrl()}/identity/accounts/register/send-verification-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, name }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  const raw = (await response.text().catch(() => "")).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return raw;
  }
}

async function register(email: string, password: string, name: string): Promise<{ status: number; detail: string }> {
  const key = masterKey(password, email);
  const body: Record<string, unknown> = {
    email,
    name,
    masterPasswordHash: masterPasswordHash(key, password),
    masterPasswordHint: null,
    key: encryptedUserKey(expand(key, "enc"), expand(key, "mac")),
    kdf: 0,
    kdfIterations: KDF_ITERATIONS,
  };

  const submit = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${vaultUrl()}/identity/accounts/register/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "device-type": "10" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: response.status, detail: (await response.text().catch(() => "")).slice(0, 300) };
  };

  const first = await submit(body);
  if (first.status.toString().startsWith("2") || /exist/i.test(first.detail)) return first;
  // With sign-ups verified the vault answers "missing required parameters"
  // rather than naming the token, so ask for one and try again.
  if (!/verification|missing required parameters/i.test(first.detail)) return first;

  const token = await verificationToken(email, name);
  if (!token) return first;
  return submit({ ...body, emailVerificationToken: token });
}

async function signIn(email: string, password: string): Promise<{ token: string | null; detail: string }> {
  const key = masterKey(password, email);
  const form = new URLSearchParams({
    grant_type: "password",
    username: email,
    password: masterPasswordHash(key, password),
    scope: "api offline_access",
    client_id: "web",
    deviceType: "10",
    deviceIdentifier: randomUUID(),
    deviceName: "AthenIQ console",
  });
  const response = await fetch(`${vaultUrl()}/identity/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { token: null, detail: (await response.text().catch(() => "")).slice(0, 300) };
  const payload = (await response.json().catch(() => null)) as { access_token?: string } | null;
  return { token: payload?.access_token ?? null, detail: "" };
}

async function profileId(token: string): Promise<string | null> {
  const response = await fetch(`${vaultUrl()}/api/accounts/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { Id?: string; id?: string } | null;
  return payload?.Id ?? payload?.id ?? null;
}

/**
 * Create (or adopt) the vault account for this address and return its id.
 * Adopting covers a person who already registered on the vault themselves: the
 * link is recorded only when their password matches, so an existing vault is
 * never claimed with someone else's credentials.
 */
export async function provisionVault(email: string, password: string, name: string): Promise<VaultResult> {
  if (!vaultEnabled()) return { ok: false, error: "Vault provisioning is switched off." };
  const address = email.trim().toLowerCase();
  try {
    const created = await register(address, password, name);
    const already = created.status === 400 && /exist/i.test(created.detail);
    if (!created.status.toString().startsWith("2") && !already) {
      return { ok: false, error: `Vault refused the account (HTTP ${created.status}).` };
    }
    const session = await signIn(address, password);
    if (!session.token) {
      return {
        ok: false,
        error: already
          ? "A vault account with this address already exists and its password differs."
          : "The vault account was created but could not be opened for linking.",
      };
    }
    const id = await profileId(session.token);
    if (!id) return { ok: false, error: "The vault did not return a profile id." };
    return {
      ok: true,
      vault: { id, email: address, url: vaultUrl(), createdAt: new Date().toISOString() },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "The vault could not be reached.",
    };
  }
}

/** A password for a vault account whose console password is not known here. */
export function vaultPassword(): string {
  return randomBytes(15).toString("base64url");
}
