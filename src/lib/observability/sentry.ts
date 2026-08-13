import * as Sentry from "@sentry/vue";
import type { App } from "vue";
import type { Router } from "vue-router";
import { scrubEvent } from "@edge-shared/observability/scrub.ts";
import { isChunkLoadError } from "../staleChunkRecovery";

/**
 * Error tracking (#644) — Sentry, EU region (`ingest.de.sentry.io`).
 *
 * Errors only. No session replay, no tracing, no metrics, no logs. Replay is
 * the one that must stay off permanently: it records the DOM, and for a DM
 * that is campaign secrets, unrevealed plot and player notes — the exact
 * material the scrubbing below exists to keep out of a sub-processor, and the
 * one form of it no `beforeSend` can filter after the fact.
 *
 * Only strictly-necessary technical data is processed, under legitimate
 * interest, which is why there is no consent banner. That claim rests on this
 * file plus `@edge-shared/observability/scrub.ts`; changing either changes what
 * the privacy policy has to say.
 */

/**
 * Errors that are expected, already handled, or are somebody else's browser.
 * Reporting them costs quota and, worse, trains you to ignore the inbox.
 */
const IGNORED: (string | RegExp)[] = [
  // Benign, fires constantly in Chrome, no user-visible effect.
  /ResizeObserver loop/,
  // The app cancels in-flight queries on navigation by design; TanStack Query
  // retries them (see the `isAbortError` branch in main.ts).
  /AbortError/,
  "The operation was aborted",
  // A user going through a tunnel is not a defect.
  /NetworkError when attempting to fetch resource/,
  /Load failed/,
  // Autofill/translate extensions injecting into the page.
  /^Non-Error promise rejection captured/,
];

const DENY_URLS: RegExp[] = [
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-web-extension:\/\//,
];

/**
 * Wire Sentry into the Vue app and router.
 *
 * A no-op when `VITE_SENTRY_DSN` is unset, which is the state of every local
 * dev run and every build made outside Vercel — so no configuration is needed
 * to work on this repo, and dev noise never reaches the production project.
 */
export function initErrorTracking(app: App, router: Router): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    app,
    dsn,
    release: __SENTRY_RELEASE__ || undefined,
    environment: __SENTRY_ENVIRONMENT__,

    /**
     * CAREFUL — this object must stay exhaustive.
     *
     * `resolveDataCollectionOptions` in @sentry/core picks its baseline like
     * this:
     *
     *     const base = options.dataCollection != null
     *       ? DEFAULTS                                   // permissive
     *       : defaultPiiToCollectionOptions(sendDefaultPii);  // conservative
     *
     * So passing *any* `dataCollection` object switches the baseline from the
     * conservative `sendDefaultPii: false` bridge to DEFAULTS, where
     * `userInfo`, `cookies`, `urlQueryParams`, `genAI.inputs` and
     * `databaseQueryData` are all **true**. Setting one field here and
     * omitting the rest would therefore turn PII collection *on* — the exact
     * opposite of what the code would appear to say. Every field is spelled
     * out for that reason; deleting a line is not a simplification.
     *
     * (`sendDefaultPii: false` is the older spelling of this. It is deprecated
     * as of 10.54.0 and removed in v11, and it loses to `dataCollection`
     * whenever both are present, so it is not used here.)
     */
    dataCollection: {
      userInfo: false, // no auto-populated email/username/ip — see setErrorTrackingUser
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [], // AI prompts and entity payloads travel in bodies
      urlQueryParams: false, // signed-storage tokens, search terms
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false, // a generator's frame holds the whole prompt
      frameContextLines: 5,
    },

    // Errors only — see the file header.
    tracesSampleRate: 0,

    ignoreErrors: IGNORED,
    denyUrls: DENY_URLS,

    beforeSend(event, hint) {
      // A stale-chunk failure is an expected consequence of deploying while
      // tabs are open, and `installStaleChunkRecovery` already fixes it by
      // reloading. Reporting it would make every deploy look like an incident.
      if (isChunkLoadError(hint?.originalException)) return null;
      return scrubEvent(event);
    },

    beforeBreadcrumb(breadcrumb) {
      // Scrubbed at creation rather than only in `beforeSend`, so the in-memory
      // ring buffer never holds an unredacted token either.
      return scrubEvent(breadcrumb);
    },
  });

  // Vue's own errorHandler is installed by `Sentry.init({ app })`. Router
  // failures bypass it — a rejected async guard or a failed route-component
  // import surfaces here and nowhere else.
  router.onError((error) => {
    if (isChunkLoadError(error)) return;
    Sentry.captureException(error);
  });
}

/**
 * Attach (or clear) the account id on subsequent events.
 *
 * The id alone — never email or username, which `dataCollection.userInfo:
 * false` stops the SDK collecting and `scrubEvent` strips even if it did. A
 * uuid that resolves to a person only through the database is what makes "is
 * this one user or everyone?" answerable, which is most of triage.
 */
export function setErrorTrackingUser(userId: string | null): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
