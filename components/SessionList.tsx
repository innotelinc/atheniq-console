"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export interface SessionEntry {
  id: string;
  name: string;
  email: string;
  source: string;
  createdAt: string;
  expiresAt: string;
  /** Time until the session expires, phrased for reading, e.g. "7h 12m left". */
  remaining: string;
  /** First sign-in this person has ever made from this source. */
  newSource: boolean;
  current: boolean;
}

/**
 * Every sign-in that can still reach the console, with the source it came from.
 * Ending one is immediate; ending all of them includes this browser, so it lands
 * on the sign-in page rather than pretending it survived.
 */
export function SessionList({ entries }: { entries: SessionEntry[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function endSession(entry: SessionEntry) {
    setBusy(entry.id);
    setError(null);
    setNotice(null);
    const result = await api<{ ended: number }>("/api/security/sessions", {
      method: "POST",
      body: JSON.stringify({ scope: "session", id: entry.id }),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? "That did not work.");
      return;
    }
    if (entry.current) {
      router.push("/login");
      return;
    }
    setNotice(`${entry.name}'s session from ${entry.source} has ended.`);
    router.refresh();
  }

  async function endAll() {
    setBusy("all");
    setError(null);
    setNotice(null);
    const result = await api<{ ended: number }>("/api/security/sessions", {
      method: "POST",
      body: JSON.stringify({ scope: "all" }),
    });
    setBusy(null);
    setConfirming(false);
    if (!result.ok) {
      setError(result.error ?? "That did not work.");
      return;
    }
    // This browser was one of the sessions that just ended.
    router.push("/login");
  }

  if (entries.length === 0) {
    return <span className="small muted">No session can reach the console right now.</span>;
  }

  return (
    <div className="stack-sm">
      {entries.map((entry) => (
        <div key={entry.id} className="between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="small strong">
              {entry.name}
              {entry.current && (
                <span className="chip ok" style={{ marginLeft: 8 }}>
                  this browser
                </span>
              )}
              {entry.newSource && (
                <span className="chip warn" style={{ marginLeft: 8 }}>
                  new source
                </span>
              )}
            </div>
            <div className="tiny muted">
              {entry.email} · from {entry.source}
            </div>
            <div className="tiny muted">
              started {entry.createdAt} · ends {entry.expiresAt} · {entry.remaining}
            </div>
          </div>
          <button
            className="btn small ghost"
            type="button"
            disabled={busy === entry.id}
            onClick={() => endSession(entry)}
          >
            {busy === entry.id ? "Ending…" : entry.current ? "Sign out" : "End"}
          </button>
        </div>
      ))}
      {notice && <span className="chip ok">{notice}</span>}
      {error && <span className="chip danger">{error}</span>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {!confirming ? (
          <button className="btn small danger" type="button" onClick={() => setConfirming(true)}>
            Sign out everywhere
          </button>
        ) : (
          <>
            <button className="btn small danger" type="button" onClick={endAll} disabled={busy === "all"}>
              {busy === "all" ? "Ending…" : `Yes, end all ${entries.length}`}
            </button>
            <button
              className="btn small ghost"
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy === "all"}
            >
              Keep them
            </button>
          </>
        )}
      </div>
      <span className="tiny muted">
        Signing out everywhere ends every session above, this one included; each person signs in again with their second
        factor. Ending one session takes effect immediately, even if that browser stays open.{" "}
        <strong>new source</strong> marks the first sign-in that person has made from that address since their account was
        created, so a session from somewhere they have never used stands out; it clears once they sign in from there
        again. Each session ends by itself when its time is up.
      </span>
    </div>
  );
}
