"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export interface StaffSessionEntry {
  id: string;
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
 * One person's live sign-ins, with a single action that ends all of them. The
 * route is registrar-only; ending a set that includes this browser sends it to
 * the sign-in page rather than a console that will refuse it.
 */
export function StaffSessions({
  staffId,
  name,
  entries,
}: {
  staffId: string;
  name: string;
  entries: StaffSessionEntry[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function endAll() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await api<{ ended: number }>("/api/security/sessions", {
      method: "POST",
      body: JSON.stringify({ scope: "staff", staffId }),
    });
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      setError(result.error ?? "That did not work.");
      return;
    }
    if (entries.some((entry) => entry.current)) {
      router.push("/login");
      return;
    }
    setNotice(`Ended ${result.data?.ended ?? entries.length} live session(s) for ${name}.`);
    router.refresh();
  }

  if (entries.length === 0) {
    return <span className="small muted">No session can reach the console for this account right now.</span>;
  }

  return (
    <div className="stack-sm">
      {entries.map((entry) => (
        <div key={entry.id} className="between" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="small strong">
              from {entry.source}
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
              started {entry.createdAt} · ends {entry.expiresAt} · {entry.remaining}
            </div>
          </div>
        </div>
      ))}
      {notice && <span className="chip ok">{notice}</span>}
      {error && <span className="chip danger">{error}</span>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {!confirming ? (
          <button className="btn small danger" type="button" onClick={() => setConfirming(true)}>
            End all for {name}
          </button>
        ) : (
          <>
            <button className="btn small danger" type="button" onClick={endAll} disabled={busy}>
              {busy ? "Ending…" : `Yes, end all ${entries.length}`}
            </button>
            <button className="btn small ghost" type="button" onClick={() => setConfirming(false)} disabled={busy}>
              Keep them
            </button>
          </>
        )}
      </div>
    </div>
  );
}
