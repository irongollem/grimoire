/**
 * Pure comparison logic for the Stripe webhook config check.
 *
 * WHY THIS EXISTS. Stripe's test and live modes have completely separate
 * configuration, and neither is stored in this repo. Nothing connects the list
 * of events our webhook *handles* to the list of events Stripe is *configured
 * to send*, so the two drift silently and the symptom is never an error — it is
 * a customer who paid and got nothing.
 *
 * That is not hypothetical. On 2026-08-01 the live endpoint was missing three
 * events that the code had handlers for:
 *   * customer.subscription.created  — after Stripe's Basil release postponed
 *     subscription creation until after payment, this became the event that
 *     grants PRO. Without it a subscriber pays and is never upgraded.
 *   * checkout.session.async_payment_succeeded / _failed — the settlement
 *     events for SEPA/Bancontact. The code deliberately withholds credits until
 *     settlement, then waited for an event nobody had subscribed to. Money in,
 *     no credits.
 *
 * Config you cannot link, you assert. Same reasoning as
 * supabase/checks/content_integrity.sql.
 *
 * The network half lives in scripts/check-stripe-webhook.ts; everything here is
 * pure so it can be unit-tested without a Stripe key.
 */

/** One drift finding, in the direction that decides how bad it is. */
export interface EventDrift {
  /** Handled in code, but Stripe will never send it — the dangerous direction. */
  readonly handledButNotEnabled: string[];
  /** Stripe sends it, but the code ignores it — wasted deliveries, not lost money. */
  readonly enabledButNotHandled: string[];
}

/**
 * Pull the Stripe event types out of the webhook's `switch (event.type)`.
 *
 * Filters to identifiers containing a dot: every Stripe event type is
 * dotted (`invoice.payment_succeeded`), so this cannot accidentally pick up an
 * unrelated `case "foo":` if the file ever grows a second switch.
 */
export function parseHandledEvents(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/case\s+"([a-z0-9_.]+)"/g)) {
    const eventType = match[1];
    if (eventType.includes(".")) found.add(eventType);
  }
  return [...found].sort();
}

/** Compare what the code handles against what the endpoint is configured to send. */
export function compareEvents(handled: readonly string[], enabled: readonly string[]): EventDrift {
  const enabledSet = new Set(enabled);
  const handledSet = new Set(handled);
  return {
    handledButNotEnabled: [...handledSet].filter((e) => !enabledSet.has(e)).sort(),
    enabledButNotHandled: [...enabledSet].filter((e) => !handledSet.has(e)).sort(),
  };
}

/**
 * The release name from a Stripe API version — "2026-07-29.dahlia" -> "dahlia".
 *
 * This matters because of how Stripe versions: monthly releases within a family
 * are backward-compatible with each other, but each new family (Acacia, Basil,
 * Dahlia…) starts with breaking changes. So a date mismatch inside one family is
 * cosmetic, and a family mismatch is a real risk of reading fields that moved.
 */
export function releaseFamily(apiVersion: string): string | null {
  const match = /^\d{4}-\d{2}-\d{2}\.([a-z]+)$/.exec(apiVersion.trim());
  return match ? match[1] : null;
}

export type VersionVerdict = "identical" | "same-release" | "different-release" | "unparseable";

/**
 * Compare the version our code sends on outbound calls against the version the
 * endpoint renders webhook payloads with. These are two independent settings and
 * are routinely confused — the endpoint's version is what shapes what we RECEIVE.
 */
export function compareApiVersions(codeVersion: string, endpointVersion: string): VersionVerdict {
  if (codeVersion.trim() === endpointVersion.trim()) return "identical";
  const codeFamily = releaseFamily(codeVersion);
  const endpointFamily = releaseFamily(endpointVersion);
  if (codeFamily === null || endpointFamily === null) return "unparseable";
  return codeFamily === endpointFamily ? "same-release" : "different-release";
}

/**
 * Every distinct `apiVersion:` literal across the edge functions. More than one
 * means some client was upgraded and others were missed, so different functions
 * would be talking to different Stripe APIs.
 */
export function parseApiVersions(sources: readonly string[]): string[] {
  const found = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/apiVersion:\s*"([^"]+)"/g)) found.add(match[1]);
  }
  return [...found].sort();
}
