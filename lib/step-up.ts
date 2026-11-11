import { verifyTotp } from "./totp";
import { readStepUpTicket } from "./webauthn";
import type { Staff } from "./types";

/**
 * Confirming a destructive action. There are two ways to prove it is really the
 * registrar at the keyboard: a current authenticator code, or a passkey
 * assertion completed moments ago. Both are short-lived, so a browser left
 * signed in elsewhere cannot take access away on its own.
 */
export interface StepUpProof {
  code?: string;
  /** Ticket from a just-completed passkey ceremony. */
  stepUp?: string;
}

/** Whether this account has any second factor to confirm with. */
export function hasSecondFactor(staff: Staff | null | undefined): boolean {
  return Boolean(staff?.totp?.enabled || (staff?.passkeys?.length ?? 0) > 0);
}

/** null when the proof is good, otherwise the message to return to the browser. */
export function checkStepUp(
  staff: Staff,
  proof: StepUpProof | null | undefined,
  messages: { missing: string; wrong: string },
): string | null {
  const ticket = typeof proof?.stepUp === "string" ? proof.stepUp : "";
  if (ticket) {
    const read = readStepUpTicket(ticket);
    if (read?.staffId === staff.id) return null;
  }

  const code = typeof proof?.code === "string" ? proof.code.replace(/\s+/g, "") : "";
  if (!code) return messages.missing;
  if (!staff.totp?.enabled || !verifyTotp(staff.totp.secret ?? "", code)) return messages.wrong;
  return null;
}
