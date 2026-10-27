// @vitest-environment happy-dom
import type { DataCollection } from "@sentry/core";
import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/vue";
import { createApp } from "vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@sentry/vue", () => sentry);

type InitOptions = {
  dataCollection: DataCollection;
  tracesSampleRate: number;
  integrations?: { name: string }[];
  ignoreErrors: (string | RegExp)[];
  denyUrls: RegExp[];
  beforeSend: (event: ErrorEvent, hint: EventHint) => ErrorEvent | null;
  beforeBreadcrumb: (crumb: Breadcrumb) => Breadcrumb | null;
};

let startErrorTracking: typeof import("./sentryClient").startErrorTracking;
let watchPageLeaving: typeof import("./pageLeaving").watchPageLeaving;

beforeAll(async () => {
  // Vite `define` constants (vite.config.ts), absent under vitest.
  vi.stubGlobal("__SENTRY_RELEASE__", "test");
  vi.stubGlobal("__SENTRY_ENVIRONMENT__", "test");
  ({ startErrorTracking } = await import("./sentryClient"));
  ({ watchPageLeaving } = await import("./pageLeaving"));
  watchPageLeaving();
});

afterEach(() => {
  window.dispatchEvent(new Event("pageshow"));
});

function start() {
  const client = startErrorTracking(createApp({}), "https://key@o0.ingest.de.sentry.io/1");
  const options = sentry.init.mock.calls.at(-1)?.[0] as InitOptions;
  return { client, options };
}

function errorEvent(message: string): ErrorEvent {
  return { type: undefined, message };
}

describe("data collection (the privacy-policy claim, #644)", () => {
  // Passing any dataCollection object makes the SDK baseline permissive, so a
  // deleted line silently turns PII collection on.
  it("deleting one line of dataCollection would turn PII collection on: every field is spelled out and off", () => {
    const { dataCollection } = start().options;
    const mustBeSpelledOut: (keyof DataCollection)[] = [
      "userInfo",
      "cookies",
      "httpHeaders",
      "httpBodies",
      "urlQueryParams",
      "graphQL",
      "genAI",
      "databaseQueryData",
      "stackFrameVariables",
    ];
    for (const key of mustBeSpelledOut) expect(dataCollection).toHaveProperty(key);

    expect(dataCollection.httpBodies).toEqual([]);

    // Every remaining leaf, however nested, is a boolean false.
    const leaves: [string, unknown][] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      } else if (!Array.isArray(value) && typeof value === "boolean") {
        leaves.push([path, value]);
      }
    };
    walk(dataCollection, "dataCollection");
    expect(leaves.length).toBeGreaterThanOrEqual(10);
    expect(leaves.filter(([, v]) => v !== false).map(([p]) => p)).toEqual([]);
  });

  it("is errors only: no tracing and no replay integration", () => {
    const { options } = start();
    expect(options.tracesSampleRate).toBe(0);
    expect((options.integrations ?? []).filter((i) => /replay/i.test(i.name))).toEqual([]);
  });

  it("ignores the handled auth-wake-up read and drops extension scripts", () => {
    const { options } = start();
    const ignored = (m: string) =>
      options.ignoreErrors.some((r) => (typeof r === "string" ? m.includes(r) : r.test(m)));
    expect(ignored("AnonymousReadError: session not usable")).toBe(true);
    expect(ignored("Cannot read properties of null")).toBe(false);
    expect(options.denyUrls.some((r) => r.test("chrome-extension://abc/content.js"))).toBe(true);
    expect(options.denyUrls.some((r) => r.test("https://app.dungeongrimoire.com/a.js"))).toBe(false);
  });
});

describe("beforeSend", () => {
  it("redacts an email and a token-bearing URL before the event leaves", () => {
    const { options } = start();
    const event: ErrorEvent = {
      ...errorEvent("save failed for jeffrey@crocode.nl"),
      request: { url: "https://x.supabase.co/storage/v1/object/sign/a.webp?token=secret123" },
    };
    const sent = options.beforeSend(event, {});
    expect(JSON.stringify(sent)).not.toContain("jeffrey@crocode.nl");
    expect(JSON.stringify(sent)).not.toContain("secret123");
  });

  it("sends nothing while the page is unloading, and sends again once it is restored", () => {
    const { options } = start();
    window.dispatchEvent(new Event("pagehide"));
    expect(options.beforeSend(errorEvent("Failed to fetch"), {})).toBeNull();
    window.dispatchEvent(new Event("pageshow"));
    expect(options.beforeSend(errorEvent("Failed to fetch"), {})).not.toBeNull();
  });

  it("does not report a stale-chunk failure, which the recovery reload already fixes", () => {
    const { options } = start();
    const hint: EventHint = {
      originalException: new TypeError("Failed to fetch dynamically imported module: /assets/x.js"),
    };
    expect(options.beforeSend(errorEvent("chunk"), hint)).toBeNull();
    expect(options.beforeSend(errorEvent("other"), { originalException: new Error("boom") })).not.toBeNull();
  });
});

describe("beforeBreadcrumb", () => {
  it("scrubs a secret out of the breadcrumb at creation", () => {
    const { options } = start();
    const crumb = options.beforeBreadcrumb({
      category: "console",
      message: "invite sent to jeffrey@crocode.nl",
    });
    expect(crumb?.message).toBe("invite sent to [email]");
  });
});

describe("user identity", () => {
  it("setUser sends the id alone, and null clears", () => {
    const { client } = start();
    client.setUser("user-1");
    expect(sentry.setUser).toHaveBeenLastCalledWith({ id: "user-1" });
    client.setUser(null);
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
  });
});
