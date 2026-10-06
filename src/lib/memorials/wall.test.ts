import { describe, expect, it } from "vitest";
import type { CharacterMemorial, MemorialMourner } from "@/types/memorial.types";
import {
  candleCounts, hiddenFromMe, onTheWall, pendingKeepPrompts, pendingTolls, splitWall, wallTally,
} from "./wall";

function memorial(over: Partial<CharacterMemorial> = {}): CharacterMemorial {
  return {
    id: "m1", party_member_id: "p1", campaign_id: "c1", owner_user_id: "u1", marked_by: "dm",
    kind: "fallen", restored_at: null, game_date: null, real_date: "2026-10-01", account: null,
    last_words: null, last_blow: null, survived_by: [], player_name: null, character_name: "Brin",
    portrait_url: null, portrait_focal_point: null, species_name: null, class_name: null, level: null,
    campaign_name: "Camp", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", ...over,
  };
}
function mourner(over: Partial<MemorialMourner> = {}): MemorialMourner {
  return {
    memorial_id: "m1", user_id: "u1", campaign_id: "c1", candle_lit_at: null, tolled_at: null,
    kept_at: null, let_go_at: null, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", ...over,
  };
}

describe("onTheWall", () => {
  it("drops restored and sorts newest first", () => {
    const a = memorial({ id: "a", real_date: "2026-09-01" });
    const b = memorial({ id: "b", real_date: "2026-10-01", created_at: "2026-10-01T09:00:00Z" });
    const c = memorial({ id: "c", real_date: "2026-10-01", created_at: "2026-10-01T11:00:00Z" });
    const d = memorial({ id: "d", restored_at: "2026-10-02T00:00:00Z" });
    expect(onTheWall([a, b, c, d]).map((m) => m.id)).toEqual(["c", "b", "a"]);
  });
});

describe("splitWall", () => {
  it("separates my characters from those beside", () => {
    const { mine, beside } = splitWall([memorial({ id: "a" }), memorial({ id: "b", owner_user_id: "u2" })], "u1");
    expect(mine.map((m) => m.id)).toEqual(["a"]);
    expect(beside.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("candleCounts", () => {
  it("counts only lit candles per memorial", () => {
    const counts = candleCounts([
      mourner({ user_id: "a", candle_lit_at: "x" }),
      mourner({ user_id: "b", candle_lit_at: "x" }),
      mourner({ user_id: "c" }),
    ]);
    expect(counts.get("m1")).toBe(2);
  });
});

describe("wallTally", () => {
  it("reads both clauses", () => {
    const ms = [
      ...Array.from({ length: 4 }, (_, i) => memorial({ id: `f${i}` })),
      ...Array.from({ length: 2 }, (_, i) => memorial({ id: `r${i}`, kind: "retired" })),
    ];
    expect(wallTally(ms)).toBe("Four have fallen. Two laid down their arms.");
  });
  it("uses singular forms and omits zero clauses", () => {
    expect(wallTally([memorial()])).toBe("One has fallen.");
    expect(wallTally([memorial({ kind: "retired" })])).toBe("One laid down their arms.");
  });
  it("uses digits beyond twenty and is null when empty", () => {
    expect(wallTally(Array.from({ length: 21 }, (_, i) => memorial({ id: `f${i}` })))).toBe("21 have fallen.");
    expect(wallTally([])).toBeNull();
  });
});

describe("pendingKeepPrompts", () => {
  const mine = memorial({ id: "m1", campaign_id: "gone" });
  it("prompts for an owned memorial in a left campaign with no answer", () => {
    expect(pendingKeepPrompts([mine], [mourner({ campaign_id: "gone" })], new Set(["c1"]), "u1")).toEqual([mine]);
  });
  it("skips answered, still-member and not-owned", () => {
    expect(pendingKeepPrompts([mine], [mourner({ kept_at: "x" })], new Set(), "u1")).toEqual([]);
    expect(pendingKeepPrompts([mine], [mourner({ let_go_at: "x" })], new Set(), "u1")).toEqual([]);
    expect(pendingKeepPrompts([mine], [mourner()], new Set(["gone"]), "u1")).toEqual([]);
    expect(pendingKeepPrompts([mine], [mourner()], new Set(), "u2")).toEqual([]);
  });
});

describe("hiddenFromMe", () => {
  it("is true only when I let it go", () => {
    expect(hiddenFromMe(memorial(), mourner({ let_go_at: "x" }))).toBe(true);
    expect(hiddenFromMe(memorial(), mourner())).toBe(false);
    expect(hiddenFromMe(memorial(), undefined)).toBe(false);
  });
});

describe("pendingTolls", () => {
  it("lists fallen, on-the-wall memorials of the campaign I have not been told of", () => {
    const m = memorial();
    expect(pendingTolls([m], [mourner()], "c1")).toEqual([m]);
    expect(pendingTolls([m], [mourner({ tolled_at: "x" })], "c1")).toEqual([]);
    expect(pendingTolls([m], [], "c1")).toEqual([]);
    expect(pendingTolls([memorial({ kind: "retired" })], [mourner()], "c1")).toEqual([]);
    expect(pendingTolls([memorial({ restored_at: "x" })], [mourner()], "c1")).toEqual([]);
    expect(pendingTolls([m], [mourner()], "c2")).toEqual([]);
  });
});
