"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { passkeyStepUp } from "@/lib/passkey-client";
import { ROLE_LABELS, ROLES, type StaffRole } from "@/lib/staff-policy";
import { shortDate } from "@/lib/format";

interface Row {
  id: string;
  name: string;
  email: string;
  title: string;
  role: StaffRole;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
}

type Sensitive = {
  id: string;
  label: string;
  body: Record<string, unknown>;
  message: string;
  /** Removal is a DELETE, so it carries only the code. */
  remove?: boolean;
};

export function StaffManager({
  staff,
  meId,
  stepUp,
  passkeyCount,
}: {
  staff: Row[];
  meId: string | null;
  stepUp: boolean;
  passkeyCount: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({ name: "", email: "", title: "", role: "publisher" as StaffRole, password: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [pending, setPending] = useState<Sensitive | null>(null);
  const [code, setCode] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  async function call(id: string, run: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id);
    setError(null);
    setNotice(null);
    const result = await run();
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? "That did not work.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const added = await call("new", () =>
      api("/api/staff", { method: "POST", body: JSON.stringify(draft) }),
    );
    if (added) {
      setNotice(`${draft.name || draft.email} can now sign in.`);
      setDraft({ name: "", email: "", title: "", role: "publisher", password: "" });
    }
  }

  async function patch(id: string, body: Record<string, unknown>, message: string): Promise<boolean> {
    const done = await call(id, () => api(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
    if (done) setNotice(message);
    return done;
  }

  async function remove(id: string, message: string, proof = "", ticket = ""): Promise<boolean> {
    const done = await call(id, () =>
      api(`/api/staff/${id}`, { method: "DELETE", body: JSON.stringify({ code: proof, stepUp: ticket }) }),
    );
    if (done) setNotice(message);
    return done;
  }

  function requestRemove(row: Row) {
    const message = `${row.name} no longer has an account.`;
    if (!stepUp) {
      void remove(row.id, message);
      return;
    }
    setError(null);
    setNotice(null);
    setCode("");
    setPending({ id: row.id, label: `Remove ${row.name}`, body: {}, message, remove: true });
  }

  /** Disabling and two-factor resets need a fresh code when one is enrolled. */
  function sensitive(row: Row, body: Record<string, unknown>, message: string, label: string) {
    if (!stepUp) {
      void patch(row.id, body, message);
      return;
    }
    setError(null);
    setNotice(null);
    setCode("");
    setPending({ id: row.id, label, body, message });
  }

  async function confirmPending() {
    if (!pending) return;
    const done = pending.remove
      ? await remove(pending.id, pending.message, code)
      : await patch(pending.id, { ...pending.body, code }, pending.message);
    if (done) {
      setPending(null);
      setCode("");
    }
  }

  /** A completed passkey ceremony is itself the confirmation. */
  async function confirmWithPasskey() {
    if (!pending) return;
    setPasskeyBusy(true);
    setError(null);
    setNotice(null);
    const step = await passkeyStepUp();
    if (!step.ok) {
      setPasskeyBusy(false);
      setError(step.error);
      return;
    }
    const done = pending.remove
      ? await remove(pending.id, pending.message, "", step.ticket)
      : await patch(pending.id, { ...pending.body, stepUp: step.ticket }, pending.message);
    setPasskeyBusy(false);
    if (done) {
      setPending(null);
      setCode("");
    }
  }

  return (
    <div className="split">
      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Accounts</h2>
            <div className="card-sub">Each person signs in with their own password; actions record who did them.</div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Last sign-in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="strong small">
                      {row.name}
                      {row.id === meId && <span className="chip muted" style={{ marginLeft: 6 }}>you</span>}
                      {row.disabled && <span className="chip bad" style={{ marginLeft: 6 }}>disabled</span>}
                      <span className={`chip ${row.twoFactorEnabled ? "ok" : "warn"}`} style={{ marginLeft: 6 }}>
                        {row.twoFactorEnabled ? "2FA" : "no 2FA"}
                      </span>
                    </div>
                    <div className="tiny muted">{row.email}</div>
                    <div className="tiny muted">{row.title}</div>
                  </td>
                  <td>
                    <select
                      className="select"
                      value={row.role}
                      disabled={busy === row.id}
                      onChange={(event) =>
                        patch(row.id, { role: event.target.value }, `${row.name} is now ${ROLE_LABELS[event.target.value as StaffRole]}.`)
                      }
                      aria-label={`Role for ${row.name}`}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="small muted nowrap">
                    {row.lastLoginAt ? shortDate(row.lastLoginAt) : "never"}
                  </td>
                  <td className="actions">
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <Link className="btn small ghost" href={`/staff/${row.id}`}>
                        Activity
                      </Link>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy === row.id}
                        onClick={() => {
                          setResetFor(resetFor === row.id ? null : row.id);
                          setResetPassword("");
                        }}
                      >
                        Password
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy === row.id || !row.twoFactorEnabled}
                        onClick={() =>
                          sensitive(
                            row,
                            { reset2fa: true },
                            `${row.name} will set up two-factor at the next sign-in.`,
                            `Reset two-factor for ${row.name}`,
                          )
                        }
                      >
                        Reset 2FA
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy === row.id || row.id === meId}
                        onClick={() =>
                          row.disabled
                            ? patch(row.id, { disabled: false }, `${row.name} can sign in again.`)
                            : sensitive(row, { disabled: true }, `${row.name} is disabled.`, `Disable ${row.name}`)
                        }
                      >
                        {row.disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy === row.id || row.id === meId}
                        onClick={() => requestRemove(row)}
                      >
                        Remove
                      </button>
                    </div>
                    {resetFor === row.id && (
                      <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                        <input
                          className="input"
                          type="password"
                          placeholder="New password"
                          value={resetPassword}
                          onChange={(event) => setResetPassword(event.target.value)}
                          style={{ maxWidth: 200 }}
                        />
                        <button
                          type="button"
                          className="btn small primary"
                          disabled={resetPassword.length < 10 || busy === row.id}
                          onClick={async () => {
                            const done = await patch(row.id, { password: resetPassword }, `Password reset for ${row.name}.`);
                            if (done) {
                              setResetFor(null);
                              setResetPassword("");
                            }
                          }}
                        >
                          Set
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pending && (
          <div className="card-body stack-sm">
            <div className="small strong">{pending.label}</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                aria-label="Authenticator code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                style={{ maxWidth: 160 }}
              />
              <button
                type="button"
                className="btn small primary"
                disabled={busy !== null || passkeyBusy}
                onClick={() => void confirmPending()}
              >
                Confirm
              </button>
              {passkeyCount > 0 && (
                <button
                  type="button"
                  className="btn small ghost"
                  disabled={busy !== null || passkeyBusy}
                  onClick={() => void confirmWithPasskey()}
                >
                  {passkeyBusy ? "Waiting for your device…" : "Use a passkey"}
                </button>
              )}
              <button
                type="button"
                className="btn small ghost"
                disabled={busy !== null || passkeyBusy}
                onClick={() => {
                  setPending(null);
                  setCode("");
                }}
              >
                Cancel
              </button>
            </div>
            <span className="tiny muted">
              This needs a fresh code from your authenticator or a passkey, so a browser left signed in elsewhere
              cannot take someone&apos;s access away, reset their second factor or remove their account.
            </span>
          </div>
        )}
        {(error || notice) && (
          <div className="card-body">
            {error && <div className="chip danger">{error}</div>}
            {notice && <div className="chip ok">{notice}</div>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Add a staff member</h2>
            <div className="card-sub">They sign in immediately with this password.</div>
          </div>
        </div>
        <form className="card-body stack" onSubmit={add}>
          <div className="field">
            <label className="label" htmlFor="staff-name">Name</label>
            <input
              id="staff-name"
              className="input"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="staff-email">Email</label>
            <input
              id="staff-email"
              className="input"
              type="email"
              value={draft.email}
              onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="staff-title">Title (optional)</label>
            <input
              id="staff-title"
              className="input"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="staff-role">Role</label>
            <select
              id="staff-role"
              className="select"
              value={draft.role}
              onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value as StaffRole }))}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="staff-password">Initial password</label>
            <input
              id="staff-password"
              className="input"
              type="password"
              value={draft.password}
              onChange={(event) => setDraft((prev) => ({ ...prev, password: event.target.value }))}
              minLength={10}
              required
            />
          </div>
          <button className="btn primary" type="submit" disabled={busy === "new"}>
            {busy === "new" ? "Adding…" : "Add account"}
          </button>
          <span className="tiny muted">
            At least 10 characters, and the email must be on a registered domain. They set up two-factor at first
            sign-in.
          </span>
        </form>
      </div>
    </div>
  );
}
