import { getDb } from "./store";

/**
 * Sign-in throttling for repeated refusals.
 *
 * Derived from the sign-in log rather than a timer in memory, so a restart does
 * not reset an attack, and a successful sign-in empties the window naturally as
 * the entries age out. Only password and code steps are throttled: a passkey is
 * possession plus user verification, and blocking it would let an attacker who
 * knows an address lock the real owner out of their strongest factor.
 */
export const LOCK_WINDOW_MS = 15 * 60_000;
export const LOCK_THRESHOLD = 5;

export interface Lockout {
  locked: boolean;
  attempts: number;
  retryAfterSeconds: number;
}

export function signInLockout(email: string): Lockout {
  const key = email.trim().toLowerCase();
  if (!key) return { locked: false, attempts: 0, retryAfterSeconds: 0 };

  const now = Date.now();
  const recent = getDb()
    .authLog.filter(
      (event) =>
        event.email.trim().toLowerCase() === key &&
        event.outcome !== "success" &&
        now - new Date(event.at).getTime() < LOCK_WINDOW_MS,
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (recent.length < LOCK_THRESHOLD) {
    return { locked: false, attempts: recent.length, retryAfterSeconds: 0 };
  }

  // Unlock when the oldest counted refusal falls out of the window.
  const blocking = recent[LOCK_THRESHOLD - 1];
  const until = new Date(blocking.at).getTime() + LOCK_WINDOW_MS;
  return {
    locked: until > now,
    attempts: recent.length,
    retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)),
  };
}

export function lockoutMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many refused attempts for that address. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
