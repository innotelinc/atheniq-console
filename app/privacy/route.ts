import { brandOf } from "@/lib/branding";
import { privacyPolicyHtml } from "@/lib/privacy-policy";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The App Store's privacy policy URL: https://registrar.atheniq.institute/privacy
 *
 * WHY A ROUTE HANDLER AND NOT A PAGE. The console host sits behind oauth2-proxy
 * (`deploy/compose/atheniq-sso.yml`), whose `--skip-auth-route` list exempts
 * `/privacy` but not `/_next/static/...`. A React page therefore delivered its
 * HTML while its client chunk redirected to the sign-in flow, and the browser
 * showed "Application error: a client-side exception has occurred" — to exactly
 * the audience this URL exists for: a reviewer with no account. A document with
 * inline styling and no script cannot fail that way.
 */
export function GET() {
  const brand = brandOf(getDb().settings);
  const title = `Privacy policy — ${brand.siteName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</title>
<meta name="description" content="How ${brand.siteName} handles personal data in the ${brand.siteName} iPhone app and on ${brand.domain}.">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: #1a2b25;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 760px; margin: 0 auto; padding: 48px 24px 80px; }
  .eyebrow { margin: 0; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #6b7d76; }
  h1 { margin: 8px 0 24px; font-size: 34px; line-height: 1.2; }
  h2 { margin: 32px 0 8px; font-size: 20px; line-height: 1.3; }
  p { margin: 0 0 14px; }
  ul { margin: 0 0 14px; padding-left: 20px; }
  li { margin: 6px 0; }
  a { color: #0a7a5a; }
  footer { margin-top: 40px; font-size: 13px; color: #6b7d76; }
</style>
</head>
<body>
<main>
<p class="eyebrow">Legal</p>
<h1>Privacy policy</h1>
${privacyPolicyHtml(brand)}
<footer>AthenIQ Institute</footer>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
