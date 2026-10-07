import * as Sentry from "@sentry/vue";
import type { App } from "vue";
import { scrubEvent } from "@edge-shared/observability/scrub.ts";
import { isStaleChunkError } from "../staleChunkRecovery";

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
 * This module is the SDK and its configuration, and nothing else. It is loaded
 * only through a dynamic `import()` from `sentry.ts`, which is what keeps
 * `@sentry/*` (~40 kB gzip) off the startup critical path. Nothing statically
 * reachable from `main.ts` may import it.
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
  // A read refused because the session was not usable yet (authAwareFetch). By
  // design this fires once per query in a mobile wake-up burst — dozens at a
  // time — and resolves itself when auth-js lands the refresh. It is the
  // handled path, not the fault; the fault would be the 200 [] it replaced.
  /AnonymousReadError/,
  "Request blocked: the session is not usable yet",
];

const DENY_URLS: RegExp[] = [
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-web-extension:\/\//,
];

/** What the facade needs from a started client. */
export interface ErrorTrackingClient {
  capture(error: unknown, hint?: CaptureHint): void;
  setUser(userId: string | null): void;
}

export interface CaptureHint {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  /** Set for errors the facade caught before this client existed. */
  mechanism?: { type: string; handled: boolean };
}

/**
 * Initialise Sentry against the Vue app. `Sentry.init({ app })` installs Vue's
 * errorHandler wrapper and the global `error` / `unhandledrejection` handlers,
 * so the facade must have removed its own stand-ins first (see `sentry.ts`).
 */
export function startErrorTracking(app: App, dsn: string): ErrorTrackingClient {
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
      // Note this must be isStaleChunkError, not isChunkLoadError: Vite
      // swallows the engine's message and vue-router rethrows a different one.
      if (isStaleChunkError(hint?.originalException)) return null;
      return scrubEvent(event);
    },

    beforeBreadcrumb(breadcrumb) {
      // Scrubbed at creation rather than only in `beforeSend`, so the in-memory
      // ring buffer never holds an unredacted token either.
      return scrubEvent(breadcrumb);
    },
  });

  return {
    capture(error, hint) {
      // `tags` and `extra` ride in the capture context; the mechanism is an
      // event hint of its own.
      Sentry.captureException(error, {
        mechanism: hint?.mechanism,
        captureContext: { tags: hint?.tags, extra: hint?.extra },
      });
    },
    setUser(userId) {
      Sentry.setUser(userId ? { id: userId } : null);
    },
  };
}
