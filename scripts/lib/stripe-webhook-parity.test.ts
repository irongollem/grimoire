import { describe, it, expect } from "vitest";

import {
  parseHandledEvents,
  compareEvents,
  releaseFamily,
  compareApiVersions,
  parseApiVersions,
} from "./stripe-webhook-parity";

describe("parseHandledEvents", () => {
  it("pulls event types out of a switch", () => {
    const source = `
      switch (event.type) {
        case "checkout.session.completed": { break; }
        case "invoice.payment_succeeded": { break; }
      }`;
    expect(parseHandledEvents(source)).toEqual([
      "checkout.session.completed",
      "invoice.payment_succeeded",
    ]);
  });

  it("keeps fall-through cases that share one body", () => {
    // price.created/price.updated are written this way in the real webhook.
    const source = `case "price.created":\n      case "price.updated": {`;
    expect(parseHandledEvents(source)).toEqual(["price.created", "price.updated"]);
  });

  it("ignores non-event string cases", () => {
    // Guards against a second switch in the file being read as event types.
    const source = `case "pro": break; case "free": break; case "invoice.paid": break;`;
    expect(parseHandledEvents(source)).toEqual(["invoice.paid"]);
  });

  it("deduplicates and sorts", () => {
    const source = `case "b.two": case "a.one": case "b.two":`;
    expect(parseHandledEvents(source)).toEqual(["a.one", "b.two"]);
  });

  it("returns nothing for a file with no switch", () => {
    expect(parseHandledEvents("const x = 1;")).toEqual([]);
  });
});

describe("compareEvents", () => {
  it("is silent when both sides agree", () => {
    const both = ["a.one", "b.two"];
    expect(compareEvents(both, both)).toEqual({
      handledButNotEnabled: [],
      enabledButNotHandled: [],
    });
  });

  it("reports a handler Stripe will never trigger", () => {
    // The dangerous direction, and the real 2026-08-01 bug: the code granted
    // credits on async_payment_succeeded, which nobody had subscribed to.
    const drift = compareEvents(
      ["checkout.session.async_payment_succeeded", "invoice.paid"],
      ["invoice.paid"],
    );
    expect(drift.handledButNotEnabled).toEqual(["checkout.session.async_payment_succeeded"]);
    expect(drift.enabledButNotHandled).toEqual([]);
  });

  it("reports an event nobody handles", () => {
    const drift = compareEvents(["invoice.paid"], ["invoice.paid", "charge.failed"]);
    expect(drift.enabledButNotHandled).toEqual(["charge.failed"]);
    expect(drift.handledButNotEnabled).toEqual([]);
  });

  it("reports both directions at once", () => {
    const drift = compareEvents(["a.one"], ["b.two"]);
    expect(drift.handledButNotEnabled).toEqual(["a.one"]);
    expect(drift.enabledButNotHandled).toEqual(["b.two"]);
  });

  it("treats an empty enabled list as everything missing", () => {
    // What a freshly created endpoint with no events selected looks like.
    expect(compareEvents(["a.one", "b.two"], []).handledButNotEnabled).toEqual(["a.one", "b.two"]);
  });
});

describe("releaseFamily", () => {
  it("extracts the release name", () => {
    expect(releaseFamily("2026-07-29.dahlia")).toBe("dahlia");
    expect(releaseFamily("2025-03-31.basil")).toBe("basil");
  });

  it("tolerates surrounding whitespace", () => {
    expect(releaseFamily("  2026-04-22.dahlia ")).toBe("dahlia");
  });

  it("returns null for anything that is not a dated release", () => {
    expect(releaseFamily("2026-07-29")).toBeNull();
    expect(releaseFamily("latest")).toBeNull();
    expect(releaseFamily("")).toBeNull();
  });
});

describe("compareApiVersions", () => {
  it("identifies an exact match", () => {
    expect(compareApiVersions("2026-07-29.dahlia", "2026-07-29.dahlia")).toBe("identical");
  });

  it("treats different dates in one release as compatible", () => {
    // Stripe guarantees no breaking changes within a release, which is why the
    // live endpoint sitting at 2026-04-22.dahlia against a 2026-07-29.dahlia SDK
    // is not a problem worth a risky endpoint migration.
    expect(compareApiVersions("2026-07-29.dahlia", "2026-04-22.dahlia")).toBe("same-release");
  });

  it("flags a release boundary, where fields move", () => {
    // Basil -> Dahlia is exactly the crossing that moved
    // Invoice.subscription and Subscription.current_period_end.
    expect(compareApiVersions("2026-07-29.dahlia", "2025-03-31.basil")).toBe("different-release");
  });

  it("reports unparseable versions rather than guessing", () => {
    expect(compareApiVersions("2026-07-29.dahlia", "whatever")).toBe("unparseable");
  });
});

describe("parseApiVersions", () => {
  it("collects the distinct versions across files", () => {
    expect(parseApiVersions([`apiVersion: "2026-07-29.dahlia",`, `apiVersion: "2026-07-29.dahlia",`]))
      .toEqual(["2026-07-29.dahlia"]);
  });

  it("surfaces a half-finished upgrade as more than one version", () => {
    expect(parseApiVersions([`apiVersion: "2026-07-29.dahlia",`, `apiVersion: "2024-06-20",`]))
      .toEqual(["2024-06-20", "2026-07-29.dahlia"]);
  });

  it("returns nothing when no client pins a version", () => {
    expect(parseApiVersions(["const stripe = new Stripe(key);"])).toEqual([]);
  });
});
