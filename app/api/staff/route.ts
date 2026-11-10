import { fail, ok, str } from "@/lib/api";
import { currentStaff } from "@/lib/current-staff";
import { getDb, logActivity, mutate, newId, nowIso } from "@/lib/store";
import { actorRef, emptyTotp, hashPassword } from "@/lib/staff";
import { describeDomains, emailAllowed } from "@/lib/email-policy";
import { ROLE_DESCRIPTIONS, can, coerceRole } from "@/lib/staff-policy";
import type { Staff } from "@/lib/types";

export const dynamic = "force-dynamic";

/** passwordHash never leaves the server. */
function publicStaff(member: Staff) {
  const { passwordHash, ...rest } = member;
  return rest;
}

async function guard() {
  if (!process.env.AUTH_PASSWORD) return null;
  const me = await currentStaff();
  return can(me?.role, "staff") ? me : null;
}

export async function GET() {
  if (process.env.AUTH_PASSWORD && !(await guard())) {
    return fail("Only a registrar can manage staff accounts.", 403);
  }
  return ok(getDb().staff.map(publicStaff));
}

interface Body {
  name?: string;
  email?: string;
  title?: string;
  role?: string;
  password?: string;
}

export async function POST(request: Request) {
  const me = await guard();
  if (process.env.AUTH_PASSWORD && !me) return fail("Only a registrar can manage staff accounts.", 403);

  const body = (await request.json().catch(() => null)) as Body | null;
  const name = str(body?.name);
  const email = str(body?.email).toLowerCase();
  const password = str(body?.password);
  const role = coerceRole(body?.role);

  if (!name) return fail("Give the staff member a name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("That email address does not look right.");
  const allowedDomains = getDb().settings.auth.allowedDomains;
  if (!emailAllowed(email, allowedDomains)) {
    return fail(`Staff accounts must use a registered domain (${describeDomains(allowedDomains)}).`);
  }
  if (password.length < 10) return fail("Use a password of at least 10 characters.");
  if (getDb().staff.some((member) => member.email.toLowerCase() === email)) {
    return fail(`${email} already has an account.`);
  }

  const created = await mutate((db) => {
    const staff: Staff = {
      id: newId("stf"),
      email,
      name,
      title: str(body?.title) || ROLE_DESCRIPTIONS[role].split(".")[0],
      role,
      passwordHash: hashPassword(password),
      createdAt: nowIso(),
      lastLoginAt: null,
      disabled: false,
      totp: emptyTotp(),
      passkeys: [],
    };
    db.staff.push(staff);
    logActivity(db, "settings.updated", `Added ${staff.name} as ${role}`, staff.id, me ? actorRef(me) : null);
    return staff;
  });

  return ok(publicStaff(created), 201);
}
