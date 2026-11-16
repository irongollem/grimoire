import { describe, expect, it } from "vitest";
import type { RollTableEntry } from "@/types/rollTable.types";
import { buildQuestionOptions, entryRefKey, type EntryPicture } from "./options";

const entry = (over: Partial<RollTableEntry> & { id: string }): RollTableEntry => ({
  min: 1,
  max: 1,
  label: "Thing",
  ...over,
});

const pic = (url: string): EntryPicture => ({ name: "n", image_url: url, focal: { x: 10, y: 20 } });

describe("entryRefKey", () => {
  it("keeps a monster and an item with the same id apart", () => {
    expect(entryRefKey({ kind: "monster", id: "x" })).not.toBe(entryRefKey({ kind: "item", id: "x" }));
  });
});

const PLAIN = { gift: false };

describe("buildQuestionOptions", () => {
  it("never hands a player an NPC id, though the NPC's picture is still shown", () => {
    const [opt] = buildQuestionOptions(
      [entry({ id: "e1", ref: { kind: "npc", id: "npc-1" } })],
      new Map([["npc:npc-1", pic("/npc.webp")]]),
      PLAIN,
    );
    expect(opt?.ref).toBeNull();
    expect(opt?.image_url).toBe("/npc.webp");
  });

  it("hands over an NPC's id only in a gift, where the NPC joins the party", () => {
    const [opt] = buildQuestionOptions([entry({ id: "e1", ref: { kind: "npc", id: "npc-1" } })], new Map(), { gift: true });
    expect(opt?.ref).toEqual({ kind: "npc", id: "npc-1" });
  });

  it("keeps a monster ref so a picked creature can be given", () => {
    const [opt] = buildQuestionOptions(
      [entry({ id: "e1", ref: { kind: "monster", id: "srd_wolf" } })],
      new Map([["monster:srd_wolf", pic("/wolf.webp")]]),
      PLAIN,
    );
    expect(opt).toMatchObject({ ref: { kind: "monster", id: "srd_wolf" }, image_url: "/wolf.webp", focal: { x: 10, y: 20 } });
  });

  it("skips an entry with a blank label, which the database would refuse", () => {
    const options = buildQuestionOptions([entry({ id: "a", label: "   " }), entry({ id: "b", label: " Owl " })], new Map(), PLAIN);
    expect(options.map((o) => [o.id, o.label])).toEqual([["b", "Owl"]]);
  });

  it("turns an empty blurb into null and never copies the DM's notes", () => {
    const [opt] = buildQuestionOptions([entry({ id: "a", blurb: "  ", notes: "secret" })], new Map(), PLAIN);
    expect(opt?.blurb).toBeNull();
    expect(JSON.stringify(opt)).not.toContain("secret");
  });

  it("leaves the picture empty when the ref has not resolved", () => {
    const [opt] = buildQuestionOptions([entry({ id: "a", ref: { kind: "item", id: "i1" } })], new Map(), PLAIN);
    expect(opt).toMatchObject({ image_url: null, focal: null, ref: { kind: "item", id: "i1" } });
  });

  it("keeps entry order and each entry's range", () => {
    const options = buildQuestionOptions(
      [entry({ id: "b", min: 4, max: 6 }), entry({ id: "a", min: 1, max: 3 })],
      new Map(),
      PLAIN,
    );
    expect(options.map((o) => [o.id, o.min, o.max])).toEqual([["b", 4, 6], ["a", 1, 3]]);
  });
});
