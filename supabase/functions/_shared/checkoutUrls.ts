/**
 * The URLs a Stripe Checkout Session is built with. Pure, so the redirect rules
 * are unit-tested (checkoutUrls.test.ts) rather than trusted.
 *
 * Return URLs are server configuration plus, at most, a caller-supplied **path**
 * — never a caller-controlled origin. Reflecting an Origin header here once
 * made an open post-checkout redirect; a path cannot, because the host is
 * always `appUrl`. `safeReturnPath` still refuses anything a browser could read
 * as another host (`//evil.test`, `/\evil.test`).
 */

const PROBE_ORIGIN = "https://app.invalid";

/** A same-origin app path to come back to after checkout, or null. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  return url.pathname + url.search;
}

/** `path` with `key=value` set in its query string, keeping any existing query. */
export function withQueryFlag(path: string, key: string, value: string): string {
  const url = new URL(path, PROBE_ORIGIN);
  url.searchParams.set(key, value);
  return url.pathname + url.search;
}

/**
 * Success and cancel URLs for a checkout. Without a return path the buyer
 * lands on the Billing page; with one — a generator's "not enough credits"
 * dialog passes the page it was opened on — they come back to where they were
 * blocked, with `flag` set so that page can confirm the purchase.
 */
export function checkoutReturnUrls(
  appUrl: string,
  returnPath: unknown,
  flag: { key: string; value: string },
): { success_url: string; cancel_url: string } {
  const path = safeReturnPath(returnPath) ?? "/billing";
  return {
    success_url: `${appUrl}${withQueryFlag(path, flag.key, flag.value)}`,
    cancel_url: `${appUrl}${path}`,
  };
}

/**
 * The ToS acceptance line Stripe shows at checkout. The legal pages are
 * canonical on the marketing site (apex domain), not the app — linking
 * `${appUrl}/terms` sent buyers to the app's 404 at the moment of payment.
 */
export function termsAcceptanceMessage(marketingUrl: string): string {
  const base = marketingUrl.replace(/\/$/, "");
  return `I agree to the [Terms of Service](${base}/terms) and [Refund Policy](${base}/refunds).`;
}
