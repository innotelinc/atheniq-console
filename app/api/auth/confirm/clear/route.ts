import { cookies } from "next/headers";
import { fail, ok } from "@/lib/api";
import { currentStaff } from "@/lib/current-staff";
import { CONFIRM_COOKIE } from "@/lib/step-up";

export const dynamic = "force-dynamic";

/**
 * Forget the remembered confirmation now instead of waiting for it to lapse.
 * Ending it early only makes the console ask again, so there is nothing to
 * authorise beyond being signed in.
 */
export async function POST() {
  const staff = await currentStaff();
  if (!staff) return fail("Sign in first.", 401);

  (await cookies()).delete(CONFIRM_COOKIE);
  return ok({ cleared: true });
}
