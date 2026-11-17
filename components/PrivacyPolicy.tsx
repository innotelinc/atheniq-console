import { brandOf } from "@/lib/branding";
import { privacyPolicyHtml } from "@/lib/privacy-policy";
import { getDb } from "@/lib/store";

/**
 * The privacy policy, shared by the public site page (/site/privacy) and the
 * console's own public page (/privacy), because the App Store needs one stable
 * URL and the marketing host does not serve this app.
 *
 * The words live in lib/privacy-policy.ts as markup, not JSX, because /privacy
 * is served as a plain document (app/privacy/route.ts) and must not drift from
 * this rendering.
 */
export function PrivacyPolicy() {
  const db = getDb();
  const brand = brandOf(db.settings);

  return <div className="prose" dangerouslySetInnerHTML={{ __html: privacyPolicyHtml(brand) }} />;
}
