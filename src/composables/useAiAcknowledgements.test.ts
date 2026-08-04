import { describe, expect, it } from "vitest";
import { findAcknowledgement, type AiAcknowledgementRow } from "./useAiAcknowledgements";

function row(overrides: Partial<AiAcknowledgementRow> = {}): AiAcknowledgementRow {
  return {
    id: "ack-1",
    user_id: "user-1",
    kind: "ai_use",
    version: "2026-08-04",
    created_at: "2026-08-04T00:00:00Z",
    updated_at: "2026-08-04T00:00:00Z",
    ...overrides,
  };
}

describe("findAcknowledgement", () => {
  it("matches a row with the same kind and exact version", () => {
    expect(findAcknowledgement([row()], "ai_use", "2026-08-04")).toBe(true);
  });

  it("does not match a different version — a version bump must re-prompt", () => {
    expect(findAcknowledgement([row({ version: "2026-01-01" })], "ai_use", "2026-08-04")).toBe(false);
  });

  it("does not match a different kind — ai_use and likeness are separate consents", () => {
    expect(findAcknowledgement([row({ kind: "likeness" })], "ai_use", "2026-08-04")).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(findAcknowledgement([], "ai_use", "2026-08-04")).toBe(false);
  });

  it("finds the matching row among several", () => {
    const rows = [
      row({ id: "a", kind: "likeness", version: "2026-08-04" }),
      row({ id: "b", kind: "ai_use", version: "2025-01-01" }),
      row({ id: "c", kind: "ai_use", version: "2026-08-04" }),
    ];
    expect(findAcknowledgement(rows, "ai_use", "2026-08-04")).toBe(true);
  });
});
