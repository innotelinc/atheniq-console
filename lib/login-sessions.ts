import { SESSION_TTL_SECONDS } from "./session";
import { newId, nowIso } from "./store";
import type { Database, LoginSession } from "./types";

/**
 * Live sign-in sessions, so a single address cannot hold more than a few at
 * once. The cookie is still signed and verified without a lookup (middleware
 * runs on the edge and cannot touch the store); this registry adds the two
 * things a stateless cookie cannot do: a per-address cap, and revocation.
 *
 * A revoked session stops working on the next request that resolves the account
 * (every page and API that matters calls currentStaff), even though middleware's
 * signature check alone still passes it through.
 */
export const SESSIONS_PER_SOURCE = 3;

/** Drop finished rows so the cap counts only sessions that can still be used. */
export function pruneSessions(db: Database): void {
  if (!Array.isArray(db.loginSessions)) db.loginSessions = [];
  const now = Date.now();
  db.loginSessions = db.loginSessions.filter(
    (entry) => !entry.revokedAt && new Date(entry.expiresAt).getTime() > now,
  );
}

/**
 * Open a session for this address. At the cap, the oldest session from the same
 * address is ended so the person signing in now is never refused because of an
 * old tab; exactly `SESSIONS_PER_SOURCE` remain usable.
 */
export function openLoginSession(
  db: Database,
  staffId: string,
  source: string,
): { sid: string; ended: number } {
  pruneSessions(db);
  const onSource = db.loginSessions
    .filter((entry) => entry.source === source)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let ended = 0;
  while (onSource.length >= SESSIONS_PER_SOURCE) {
    const oldest = onSource.shift();
    if (!oldest) break;
    oldest.revokedAt = nowIso();
    ended += 1;
  }

  const sid = newId("ses");
  db.loginSessions.push({
    id: sid,
    staffId,
    source,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    revokedAt: null,
  });
  return { sid, ended };
}

/** Sessions that can still be used right now, newest first. */
export function liveSessions(db: Database): LoginSession[] {
  return (db.loginSessions ?? [])
    .filter((entry) => !entry.revokedAt && new Date(entry.expiresAt).getTime() > Date.now())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * End every live session, or just the one named. Returns how many were ended, so
 * the caller can report it and record it in the activity trail.
 */
export function revokeSessions(db: Database, sid?: string): number {
  const targets = liveSessions(db).filter((entry) => !sid || entry.id === sid);
  const at = nowIso();
  for (const entry of targets) entry.revokedAt = at;
  return targets.length;
}

export function sessionIsLive(db: Database, sid: string): boolean {
  const entry = (db.loginSessions ?? []).find((session) => session.id === sid);
  if (!entry) return false;
  if (entry.revokedAt) return false;
  return new Date(entry.expiresAt).getTime() > Date.now();
}

export function revokeSession(db: Database, sid: string): boolean {
  const entry = (db.loginSessions ?? []).find((session) => session.id === sid);
  if (!entry || entry.revokedAt) return false;
  entry.revokedAt = nowIso();
  return true;
}
