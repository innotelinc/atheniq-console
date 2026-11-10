import Link from "next/link";
import { currentStaff } from "@/lib/current-staff";
import { authEnabled } from "@/lib/session";
import { getDb } from "@/lib/store";
import { ROLE_DESCRIPTIONS, can } from "@/lib/staff-policy";
import { emailAllowed } from "@/lib/email-policy";
import { Card, Crumbs, PageHead, Topbar } from "@/components/ui";
import { StaffManager } from "@/components/StaffManager";
import { DomainPolicyForm } from "@/components/DomainPolicyForm";
import { InviteRequests } from "@/components/InviteRequests";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const db = getDb();
  const me = await currentStaff();
  const allowed = !authEnabled() || can(me?.role, "staff");

  const staff = db.staff.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    title: member.title,
    role: member.role,
    disabled: member.disabled,
    createdAt: member.createdAt,
    lastLoginAt: member.lastLoginAt,
    twoFactorEnabled: Boolean(member.totp?.enabled),
  }));

  const blocked = db.staff
    .filter((member) => !emailAllowed(member.email, db.settings.auth.allowedDomains))
    .map((member) => member.email);

  const pendingRequests = (db.accessRequests ?? [])
    .filter((entry) => entry.status === "pending")
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      title: entry.title,
      reason: entry.reason,
      createdAt: entry.createdAt,
    }));

  const activity = db.activity.filter((item) => item.kind === "settings.updated" && item.actor).slice(0, 8);

  return (
    <>
      <Topbar>
        <Crumbs items={[{ label: "Registrar console" }, { label: "Staff" }]} />
        <div className="row">
          <a className="btn small ghost" href="/api/audit/export">
            Export CSV
          </a>
          <span className="chip muted">{staff.length} accounts</span>
        </div>
      </Topbar>

      <div className="content">
        <PageHead
          eyebrow="Access & attribution"
          title="Staff accounts"
          subtitle="Everyone who can publish courses or award credentials signs in with their own password and an authenticator code, and every action records who took it. Only registered email domains are accepted."
        />

        {!allowed ? (
          <Card title="Registrar only">
            <div className="card-body stack-sm">
              <p className="small muted" style={{ margin: 0 }}>
                Your account can publish courses but cannot manage staff. Ask a registrar if you need access changed.
              </p>
              <Link className="btn small" href="/">
                Back to the dashboard
              </Link>
            </div>
          </Card>
        ) : (
          <div className="stack mt">
            <StaffManager staff={staff} meId={me?.id ?? null} />

            <Card
              title="Access requests"
              subtitle="People on a registered domain who asked for an account. Approving opens it with the password they chose."
            >
              <div className="card-body stack-sm">
                <InviteRequests requests={pendingRequests} />
              </div>
            </Card>

            <DomainPolicyForm
              domains={db.settings.auth.allowedDomains}
              require2fa={db.settings.auth.require2fa}
              blocked={blocked}
            />

            <div className="split">
              <Card title="What each role can do">
                <div className="card-body stack-sm">
                  {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => (
                    <div key={role}>
                      <div className="strong small">{role === "registrar" ? "Registrar" : "Publisher"}</div>
                      <div className="tiny muted">{description}</div>
                    </div>
                  ))}
                  <span className="tiny muted">
                    Sign-in is only enforced when AUTH_PASSWORD is set; the public /verify page never needs an account.
                  </span>
                </div>
              </Card>

              <Card title="Account changes" subtitle="The most recent changes to who can sign in.">
                <div className="card-body stack-sm">
                  {activity.length === 0 ? (
                    <span className="small muted">No account changes recorded yet.</span>
                  ) : (
                    activity.map((item) => (
                      <div key={item.id} className="between" style={{ alignItems: "flex-start" }}>
                        <span className="small">{item.message}</span>
                        <span className="tiny muted nowrap">by {item.actor?.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
