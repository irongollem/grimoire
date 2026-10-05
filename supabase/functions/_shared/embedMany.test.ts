import { describe, expect, it } from "vitest";
import { authorizeRows, campaignIdsToCheck, MANY_MAX_IDS, parseManyIds } from "./embedMany";

describe("parseManyIds", () => {
  it("dedupes and keeps first-seen order", () => {
    expect(parseManyIds(["b", "a", "b"])).toEqual({ ids: ["b", "a"] });
  });
  it("rejects non-arrays, empties and non-string members", () => {
    expect("error" in parseManyIds("a")).toBe(true);
    expect("error" in parseManyIds([])).toBe(true);
    expect("error" in parseManyIds(["a", 3])).toBe(true);
    expect("error" in parseManyIds([""])).toBe(true);
  });
  it("caps distinct ids, not raw length", () => {
    const ids = Array.from({ length: MANY_MAX_IDS }, (_, i) => `id${i}`);
    expect("ids" in parseManyIds([...ids, ...ids])).toBe(true);
    expect("error" in parseManyIds([...ids, "extra"])).toBe(true);
  });
});

describe("authorizeRows", () => {
  const rows = [
    { id: "mine", user_id: "me" },
    { id: "theirs", user_id: "other" },
    { id: "note-ok", user_id: "me", campaign_id: "c1" },
    { id: "note-bad", user_id: "me", campaign_id: "c2" },
  ];
  it("splits allowed, forbidden and not found per row", () => {
    const r = authorizeRows(["mine", "theirs", "gone", "note-ok", "note-bad"], rows, "me", new Set(["c1"]));
    expect(r.allowed.map((x) => x.id)).toEqual(["mine", "note-ok"]);
    expect(r.forbidden).toEqual(["theirs", "note-bad"]);
    expect(r.notFound).toEqual(["gone"]);
  });
  it("treats a null campaign_id as a global note", () => {
    const r = authorizeRows(["n"], [{ id: "n", user_id: "me", campaign_id: null }], "me", new Set());
    expect(r.allowed).toHaveLength(1);
  });
  it("never reads campaign_id for an entity without the campaign rule", () => {
    const r = authorizeRows(["npc"], [{ id: "npc", user_id: "me", campaign_id: "c9" }], "me", null);
    expect(r.allowed.map((x) => x.id)).toEqual(["npc"]);
  });
  it("still refuses another account's row when no campaign rule applies", () => {
    const r = authorizeRows(["npc"], [{ id: "npc", user_id: "other", campaign_id: "c9" }], "me", null);
    expect(r.forbidden).toEqual(["npc"]);
  });
});

describe("campaignIdsToCheck", () => {
  it("lists each distinct campaign of the caller's own rows once", () => {
    const ids = campaignIdsToCheck(
      [
        { id: "1", user_id: "me", campaign_id: "c1" },
        { id: "2", user_id: "me", campaign_id: "c1" },
        { id: "3", user_id: "other", campaign_id: "c9" },
        { id: "4", user_id: "me" },
      ],
      "me",
    );
    expect(ids).toEqual(["c1"]);
  });
});
