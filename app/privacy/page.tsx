import Link from "next/link";
import { PrivacyPolicy } from "@/components/PrivacyPolicy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Privacy policy — AthenIQ" };

/**
 * The privacy policy on the console host, public and session-free.
 *
 * The marketing host (atheniq.institute) does not serve this app, and the App
 * Store needs one stable public URL, so the policy is published here too:
 * https://registrar.atheniq.institute/privacy
 */
export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px", lineHeight: 1.65 }}>
      <p style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6b7d76" }}>Legal</p>
      <h1 style={{ fontSize: 34, margin: "8px 0 24px" }}>Privacy policy</h1>
      <PrivacyPolicy />
      <p style={{ marginTop: 40, fontSize: 13, color: "#6b7d76" }}>
        <Link href="/site">AthenIQ Institute</Link>
      </p>
    </div>
  );
}
