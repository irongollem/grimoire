import { describe, expect, it } from "vitest";
import { STALLED_AFTER_MS, isStalled, retryReason, stalledBefore } from "./generationLiveness";

const NOW = Date.parse("2026-09-27T20:00:00Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("generation liveness", () => {
  it("presumes a generating claim dead only once it outlives any request", () => {
    expect(isStalled({ status: "generating", updated_at: at(STALLED_AFTER_MS + 1) }, NOW)).toBe(true);
    expect(isStalled({ status: "generating", updated_at: at(60_000) }, NOW)).toBe(false);
  });

  it("never calls a job stalled that is not claimed", () => {
    for (const status of ["pending", "generated", "normalized", "failed", "cancelled"]) {
      expect(isStalled({ status, updated_at: at(STALLED_AFTER_MS * 10) }, NOW)).toBe(false);
    }
  });

  it("offers retry on failed and stalled jobs with a reason", () => {
    expect(retryReason({ status: "failed", updated_at: at(0), error: "Provider timeout" }, NOW)).toBe("Provider timeout");
    expect(retryReason({ status: "generating", updated_at: at(STALLED_AFTER_MS * 2), error: null }, NOW)).toBe("The generation call never returned");
    expect(retryReason({ status: "generating", updated_at: at(1000), error: null }, NOW)).toBeNull();
    expect(retryReason({ status: "generated", updated_at: at(STALLED_AFTER_MS * 2), error: null }, NOW)).toBeNull();
  });

  it("puts the cutoff exactly one stall window back", () => {
    expect(stalledBefore(NOW)).toBe(new Date(NOW - STALLED_AFTER_MS).toISOString());
  });
});
