import { cookies } from "next/headers";
import { ok } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return ok({ signedOut: true });
}
