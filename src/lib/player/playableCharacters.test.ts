import { describe, expect, it } from "vitest";
import { nextPlayableId, pickHome, wentBackMessage } from "@/lib/player/playableCharacters";
import type { PartyMember } from "@/types/party.types";

function member(id: string, updated_at: string): PartyMember {
  return { id, updated_at } as PartyMember;
}

const older = member("a", "2026-10-01T00:00:00Z");
const newer = member("b", "2026-10-10T00:00:00Z");

describe("pickHome", () => {
  it("prefers the character the hand-over remembered", () => {
    expect(pickHome([older, newer], "b", ["a"])?.id).toBe("a");
  });

  it("skips a remembered character that is no longer theirs", () => {
    expect(pickHome([older, newer], "b", ["gone"])?.id).toBe("b");
  });

  it("falls back to the seat's character, then the most recently updated", () => {
    expect(pickHome([older, newer], "a", [])?.id).toBe("a");
    expect(pickHome([older, newer], "elsewhere", [null])?.id).toBe("b");
  });

  it("is null for a player with no character of their own", () => {
    expect(pickHome([], null, [])).toBeNull();
  });
});

describe("nextPlayableId", () => {
  it("cycles and wraps", () => {
    expect(nextPlayableId(["a", "b", "c"], "a")).toBe("b");
    expect(nextPlayableId(["a", "b", "c"], "c")).toBe("a");
  });

  it("starts at the first when the seat is on none of them", () => {
    expect(nextPlayableId(["a", "b"], "zzz")).toBe("a");
    expect(nextPlayableId(["a", "b"], null)).toBe("a");
  });

  it("is null when there is nobody to switch to", () => {
    expect(nextPlayableId([], "a")).toBeNull();
  });
});

describe("wentBackMessage", () => {
  it("names the character and the owner", () => {
    expect(wentBackMessage("Mira", "Pia")).toBe("Mira went back to Pia.");
  });

  it("falls back to their player when the owner is unknown", () => {
    expect(wentBackMessage("Mira", null)).toBe("Mira went back to their player.");
  });

  it("still says something when the character is unknown", () => {
    expect(wentBackMessage(null, null)).toContain("went back to their player");
  });
});
