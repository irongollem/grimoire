/**
 * Custom events for Vercel Web Analytics (#645).
 *
 * The transport only. It deliberately imports nothing from a feature folder —
 * see the module-placement rules in CLAUDE.md — so the wiring that decides
 * *when* an event fires lives at the call site or in `main.ts`, not here.
 *
 * Two constraints from the issue are enforced rather than merely intended:
 *
 * **No invented event names.** `AnalyticsEvent` is a closed discriminated
 * union, so adding an event is a deliberate edit to this file rather than a
 * string typed at a call site. Analytics reports rot when names multiply.
 *
 * **No user ids and no free text in payloads.** The type only permits the
 * properties each event declares, and `track` additionally rejects any value
 * that does not look like a short code-authored label. That second check is
 * belt-and-braces — every current value is a literal in source — but the whole
 * point of the cookieless choice is that nothing identifying reaches Vercel,
 * and a guard states that in a way a future call site cannot quietly ignore.
 *
 * The script itself is loaded in `index.html`, which also installs the
 * `window.va` queue shim, so calls made before the script finishes loading are
 * buffered rather than lost.
 */

/** Events we send. Adding one is a decision — keep the list short and stable. */
export type AnalyticsEvent =
  /** A campaign was created. The activation moment for a DM. */
  | { name: "campaign_created" }
  /** An AI generator started. `kind` is the generator's registry label. */
  | { name: "generator_used"; kind: string };

/**
 * A code-authored label: letters, digits, spaces and dashes, kept short.
 * Anything else is assumed to have come from user input by accident.
 */
const LABEL = /^[A-Za-z0-9][A-Za-z0-9 -]{0,31}$/;

type VaQueue = (...args: unknown[]) => void;

function queue(): VaQueue | null {
  const va = (globalThis as { va?: VaQueue }).va;
  return typeof va === "function" ? va : null;
}

/**
 * Records an event, or does nothing at all — analytics must never be able to
 * break a user's action, so every failure here is silent by design. In dev the
 * payload guard throws instead, because a bad payload is a bug to fix rather
 * than a number to under-report.
 */
export function track(event: AnalyticsEvent): void {
  const { name, ...properties } = event;

  for (const [key, value] of Object.entries(properties)) {
    if (typeof value !== "string" || !LABEL.test(value)) {
      if (import.meta.env.DEV) {
        throw new Error(
          `analytics: "${name}.${key}" must be a short code-authored label, got ${JSON.stringify(value)}. ` +
            `Event payloads must never carry user ids or free text.`,
        );
      }
      return;
    }
  }

  queue()?.("event", { name, ...properties });
}
