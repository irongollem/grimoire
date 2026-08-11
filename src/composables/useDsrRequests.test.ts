import { describe, expect, it } from "vitest";

import {
  DSR_DEADLINE_DAYS,
  DSR_OUTCOME_LABELS,
  DSR_OUTCOMES,
  DSR_REQUEST_LABELS,
  DSR_REQUEST_TYPES,
  daysUntilDue,
  type DsrRequest,
} from "./useDsrRequests";

function request(overrides: Partial<DsrRequest> = {}): DsrRequest {
  return {
    id: "r1",
    request_type: "access",
    channel: "email",
    user_id: null,
    subject_email: "someone@example.invalid",
    identity_verification: "email round-trip",
    received_at: "2026-08-01T00:00:00Z",
    fulfilled_at: null,
    outcome: null,
    notes: null,
    anonymized_at: null,
    ...overrides,
  };
}

describe("the pinned vocabularies", () => {
  // These mirror CHECK constraints in 20260811152817. A value here with no
  // label renders as a blank chip in the admin tab, which is how a mismatch
  // would otherwise reach production unnoticed.
  it("labels every request type", () => {
    for (const type of DSR_REQUEST_TYPES) {
      expect(DSR_REQUEST_LABELS[type]).toBeTruthy();
    }
  });

  it("labels every outcome", () => {
    for (const outcome of DSR_OUTCOMES) {
      expect(DSR_OUTCOME_LABELS[outcome]).toBeTruthy();
    }
  });
});

describe("daysUntilDue", () => {
  it("counts the Art. 12(3) month from receipt, not from now", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-08-01T00:00:00Z"))).toBe(DSR_DEADLINE_DAYS);
  });

  it("counts down as the deadline approaches", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-08-21T00:00:00Z"))).toBe(10);
  });

  it("goes negative once the deadline has passed — an overdue request must not read as due today", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-09-05T00:00:00Z"))).toBe(-5);
  });

  it("is exactly 0 on the deadline itself", () => {
    const received = request({ received_at: "2026-08-01T00:00:00Z" });
    expect(daysUntilDue(received, new Date("2026-08-31T00:00:00Z"))).toBe(0);
  });
});
