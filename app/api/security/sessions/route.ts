import { fail, ok, readBody } from "@/lib/api";
import { currentSessionId, currentStaff } from "@/lib/current-staff";
import { liveSessions, revokeSessions } from "@/lib/login-sessions";
import { SESSION_COOKIE } from "@/lib/session";
import { can } from "@/lib/staff-policy";
import { cookies } from "next/headers";
import { getDb, logActivity, mutate } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * End one live session, or every one of them. Registrars only: a session that
 * has been ended stops resolving an account on the next request, even though
 * middleware still accepts the signed cookie. The activity trail records the
 * act, so a mass sign-out is never silent.
 */
export async function POST(request: Request) {
  const me = await currentStaff();
  if (process.env.AUTH_PASSWORD && !can(me?.role, "staff")) {
    return fail("Only a registrar can end a session.", 403);
  }

  const body = await readBody<{ scope?: string; id?: string }>(request);
  const scope = body?.scope === "all" ? "all" : body?.scope === "session" ? "session" : null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!scope) return fail("Say whether to end one session or every session.");
  if (scope === "session" && !id) return fail("Name the session to end.");

  const mine = await currentSessionId();
  const ended = await mutate((store) => {
    const target = scope === "session" ? liveSessions(store).find((entry) => entry.id === id) : null;
    if (scope === "session" && !target) return null;
    const count = revokeSessions(store, scope === "session" ? id : undefined);
    const person = target ? store.staff.find((member) => member.id === target.staffId) : null;
    logActivity(
      store,
      "settings.updated",
      scope === "all"
        ? `Signed out every live session (${count})`
        : `Signed out a session for ${person?.name ?? "a former staff member"}`,
      target?.id ?? "",
      me ? { id: me.id, name: me.name, email: me.email, role: me.role } : null,
    );
    return count;
  });

  if (ended === null) return fail("That session had already ended.", 404);
  // If this browser's own session went with it, drop the cookie too, so the
  // person lands on the sign-in page instead of a console shell that refuses them.
  if (scope === "all" || (scope === "session" && id === mine)) {
    (await cookies()).delete(SESSION_COOKIE);
  }
  return ok({ ended, live: liveSessions(getDb()).length });
}
