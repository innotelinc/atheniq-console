import { PrivacyPolicy } from "@/components/PrivacyPolicy";

export const dynamic = "force-dynamic";

/** The policy at /privacy on the public site host. */
export default function SitePrivacyPage() {
  return (
    <section className="site-section narrow">
      <header className="section-head">
        <div>
          <div className="eyebrow">Legal</div>
          <h1>Privacy policy</h1>
        </div>
      </header>
      <PrivacyPolicy />
    </section>
  );
}
