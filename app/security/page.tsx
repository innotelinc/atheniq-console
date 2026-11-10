import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/current-staff";
import { authEnabled } from "@/lib/session";
import { getDb } from "@/lib/store";
import { can, ROLE_LABELS } from "@/lib/staff-policy";
import { dateTime, humanStatus, shortDate } from "@/lib/format";
import { Card, Crumbs, PageHead, Stat, Topbar } from "@/components/ui";
import { PasskeyManager } from "@/components/PasskeyManager";

export const dynamic = "force-dynamic";

const OUTCOME_LABELS: Record<string, string> = {
  success: "Signed in",
  invalid_password: "Wrong password",
  blocked_domain: "Blocked domain",
  totp_failed: "Wrong two-factor code",
  recovery_used: "Recovery code used",
  passkey_failed: "Passkey rejected",
};

export default async function SecurityPage() {
  const me = await currentStaff();
  if (authEnabled() && !me) redirect("/login?next=%2Fsecurity");

  const db = getDb();
  const registrar = !authEnabled() || can(me?.role, "staff");
  const weekAgo = Date.now() - 7 * 86_400_000;
  const events = db.authLog ?? [];
  const failures = events.filter((event) => event.outcome !== "success");
  const recentFailures = failures.filter((event) => new Date(event.at).getTime() >= weekAgo);
  const unenrolled = db.staff.filter((member) => !member.totp?.enabled && !member.disabled);
  const pending = (db.accessRequests ?? []).filter((entry) => entry.status === "pending");

  const myPasskeys = (me?.passkeys ?? []).map((passkey) => ({
    id: passkey.id,
    label: passkey.label,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
    algorithm: passkey.algorithm,
  }));

  return (
    <>
      <Topbar>
        <Crumbs items={[{ label: "Registrar console" }, { label: "Security" }]} />
        <span className={`chip ${recentFailures.length ? "warn" : "ok"}`}>
          {recentFailures.length ? `${recentFailures.length} failed sign-in(s) this week` : "No failed sign-ins this week"}
        </span>
      </Topbar>

      <div className="content">
        <PageHead
          eyebrow="Access & attribution"
          title="Sign-in security"
          subtitle="Who can get in, what they need to prove it, and every attempt that was refused."
        />

        <div className="split">
          <Card title="Your sign-in" subtitle={me ? `${me.email} · ${ROLE_LABELS[me.role]}` : "Console access"}>
            <div className="card-body stack-sm">
              <div className="between">
                <span className="small muted">Two-factor</span>
                <span className={`chip ${me?.totp?.enabled ? "ok" : "warn"}`}>
                  {me?.totp?.enabled ? "Authenticator enrolled" : "Not enrolled"}
                </span>
              </div>
              <div className="between">
                <span className="small muted">Passkeys</span>
                <span className="small">{myPasskeys.length}</span>
              </div>
              {me ? (
                <PasskeyManager passkeys={myPasskeys} />
              ) : (
                <span className="small muted">
                  Sign-in is switched off on this host (no AUTH_PASSWORD), so there is no personal factor to manage.
                </span>
              )}
            </div>
          </Card>

          <Card title="How access is decided" subtitle="The policy the console enforces on every attempt.">
            <div className="card-body stack-sm small">
              <div className="between">
                <span className="muted">Registered domains</span>
                <span className="mono tiny">{db.settings.auth.allowedDomains.map((d) => `@${d}`).join(" ")}</span>
              </div>
              <div className="between">
                <span className="muted">Two-factor required</span>
                <span>{db.settings.auth.require2fa ? "Yes, every sign-in" : "Optional"}</span>
              </div>
              <div className="between">
                <span className="muted">Passkeys</span>
                <span>Count as a complete sign-in</span>
              </div>
              {registrar && (
                <Link className="btn small ghost" href="/staff">
                  Change the policy
                </Link>
              )}
              <span className="tiny muted">
                A password alone never opens a session while two-factor is required. Failed attempts are recorded below
                without the password.
              </span>
            </div>
          </Card>
        </div>

        {registrar && (
          <>
            <div className="stat-grid mt">
              <Stat label="Accounts" value={db.staff.length} hint={`${unenrolled.length} without two-factor`} />
              <Stat label="Passkeys" value={db.staff.reduce((sum, member) => sum + (member.passkeys?.length ?? 0), 0)} />
              <Stat label="Failed sign-ins" value={recentFailures.length} hint="Last 7 days" />
              <Stat
                label="Pending requests"
                value={pending.length}
                hint={pending.length ? "Waiting for a registrar" : "Queue empty"}
              />
            </div>

            {unenrolled.length > 0 && (
              <div className="banner warn mt">
                <div>
                  <div className="banner-title">Accounts without a second factor</div>
                  {unenrolled.map((member) => `${member.name} (${member.email})`).join(", ")} — they enrol at their
                  next sign-in; nobody can skip it while two-factor is required.
                </div>
              </div>
            )}

            <div className="split mt">
              <Card title="Accounts" subtitle="Second factors and last sign-in per person.">
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Two-factor</th>
                        <th>Passkeys</th>
                        <th>Last sign-in</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.staff.map((member) => (
                        <tr key={member.id}>
                          <td>
                            <Link className="strong small" href={`/staff/${member.id}`}>
                              {member.name}
                            </Link>
                            <div className="tiny muted">{member.email}</div>
                          </td>
                          <td>
                            <span className={`chip ${member.totp?.enabled ? "ok" : "warn"}`}>
                              {member.totp?.enabled ? "enrolled" : "pending"}
                            </span>
                          </td>
                          <td className="small">{member.passkeys?.length ?? 0}</td>
                          <td className="small muted nowrap">
                            {member.lastLoginAt ? shortDate(member.lastLoginAt) : "never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card title="Failed sign-ins" subtitle="Newest first. Addresses are recorded, passwords never are.">
                <div className="card-body stack-sm">
                  {failures.length === 0 ? (
                    <span className="small muted">Nothing has been refused yet.</span>
                  ) : (
                    failures.slice(0, 10).map((event) => (
                      <div key={event.id} className="between" style={{ alignItems: "flex-start" }}>
                        <div>
                          <div className="small strong">{OUTCOME_LABELS[event.outcome] ?? humanStatus(event.outcome)}</div>
                          <div className="tiny muted">
                            {event.email}
                            {event.detail ? ` · ${event.detail}` : ""}
                          </div>
                        </div>
                        <span className="tiny muted nowrap">{dateTime(event.at)}</span>
                      </div>
                    ))
                  )}
                  <Link className="btn small ghost" href="/staff">
                    Review staff {pending.length ? `· ${pending.length} pending request(s)` : ""}
                  </Link>
                </div>
              </Card>
            </div>
          </>
        )}

        {!registrar && (
          <Card title="Registrar view" className="mt">
            <div className="card-body small muted">
              Account-wide security (failed sign-ins, who has enrolled) is visible to registrars.
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
