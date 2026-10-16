import { describe, expect, it } from "vitest";
import { noticeBoardState } from "./state";

describe("noticeBoardState", () => {
  it("is presenting whenever the board is being presented", () => {
    expect(noticeBoardState({ is_revealed: true, presented_at: "2026-10-16T20:00:00Z" })).toBe("presenting");
  });
  it("is shown when revealed but not presented, and nothing when hidden", () => {
    expect(noticeBoardState({ is_revealed: true, presented_at: null })).toBe("shown");
    expect(noticeBoardState({ is_revealed: false, presented_at: null })).toBeNull();
  });
});
