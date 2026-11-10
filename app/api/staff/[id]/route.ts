import { fail, ok, str } from "@/lib/api";
import { currentStaff } from "@/lib/current-staff";
import { getDb, logActivity, mutate, nowIso } from "@/lib/store";
import { emptyTotp, hashPassword } from "@/lib/staff";
import { can, coerceRole } from "@/lib/staff-policy";
import type { Staff } from "@/lib/types";

export const dynamic = "force-dynamic";

function publicStaff(member: Staff) {
  const { passwordHash, ...rest } = member;
  return rest;
}

function activeRegistrars(staff: Staff[]): Staff[] {
  return staff.filter((member) => member.role === "registrar" && !member.disabled);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentStaff();
  if (process.env.AUTH_PASSWORD && !can(me?.role, "staff")) {
    return fail("Only a registrar can manage staff accounts.", 403);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    title?: string;
    role?: string;
    password?: string;
    disabled?: boolean;
    reset2fa?: boolean;
  } | null;
  if (!body) return fail("Invalid body.");

  const target = getDb().staff.find((member) => member.id === id);
  if (!target) return fail("That account does not exist.", 404);

  const nextRole = body.role === undefined ? target.role : coerceRole(body.role);
  const nextDisabled = body.disabled === undefined ? target.disabled : Boolean(body.disabled);

  // Never let the console lose its last way in.
  const removingRegistrar =
    target.role === "registrar" && !target.disabled && (nextRole !== "registrar" || nextDisabled);
  if (removingRegistrar && activeRegistrars(getDb().staff).length <= 1) {
    return fail("This is the last active registrar — add another before changing this one.", 409);
  }
  if (me && me.id === id && nextDisabled) {
    return fail("You cannot disable the account you are signed in with.", 409);
  }
  if (body.password !== undefined && str(body.password).length < 10) {
    return fail("Use a password of at least 10 characters.");
  }

  const updated = await mutate((db) => {
    const record = db.staff.find((member) => member.id === id) as Staff;
    if (body.name !== undefined) record.name = str(body.name) || record.name;
    if (body.title !== undefined) record.title = str(body.title) || record.title;
    record.role = nextRole;
    record.disabled = nextDisabled;
    if (body.password !== undefined) record.passwordHash = hashPassword(str(body.password));
    if (body.reset2fa) {
      record.totp = emptyTotp();
      logActivity(db, "settings.updated", `Reset two-factor for ${record.name}`, record.id);
    }
    logActivity(
      db,
      "settings.updated",
      `Updated ${record.name} (${record.role}${record.disabled ? ", disabled" : ""})`,
      record.id,
    );
    return record;
  });

  return ok(publicStaff(updated));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentStaff();
  if (process.env.AUTH_PASSWORD && !can(me?.role, "staff")) {
    return fail("Only a registrar can manage staff accounts.", 403);
  }
  if (me?.id === id) return fail("You cannot remove the account you are signed in with.", 409);

  const target = getDb().staff.find((member) => member.id === id);
  if (!target) return fail("That account does not exist.", 404);
  if (target.role === "registrar" && !target.disabled && activeRegistrars(getDb().staff).length <= 1) {
    return fail("This is the last active registrar — add another before removing this one.", 409);
  }

  const removed = await mutate((db) => {
    const index = db.staff.findIndex((member) => member.id === id);
    if (index < 0) return null;
    const [record] = db.staff.splice(index, 1);
    logActivity(db, "settings.updated", `Removed ${record.name} from the console`, record.id);
    return record;
  });

  return ok({ removed: removed?.id ?? id, at: nowIso() });
}
