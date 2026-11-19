import { describe, expect, it } from "vitest";
import { COMPANIONS_MAX } from "../_shared/agent/companions.ts";
import type { AiProvenance } from "../_shared/provenance/types.ts";
import {
  afterUse, characterInsert, characterRewrite, companionMemoriesText, companionRows, foundCharacters,
  isUntouchedTableCharacter, memoryRowsFor, profileWithBelongings,
} from "./characterRows.ts";

const provenance: AiProvenance = { generatorType: "agent_turn_memory", provider: "p", model: "m", generatedAt: "t", edited: false };

describe("companions", () => {
  it("reads memories oldest first from newest-first rows, and says nothing for none", () => {
    expect(companionMemoriesText([{ body: "second" }, { body: "first" }])).toBe("What you remember of this story so far:\n- first\n- second");
    expect(companionMemoriesText([])).toBe("");
  });
  it("leaves the played member out and keeps no more than COMPANIONS_MAX", () => {
    const rows = Array.from({ length: COMPANIONS_MAX + 3 }, (_, i) => ({ id: `m${i}` }));
    const out = companionRows(rows, "m0");
    expect(out).toHaveLength(COMPANIONS_MAX);
    expect(out.map((r) => r.id)).not.toContain("m0");
    expect(companionRows([{ id: "a" }], null)).toHaveLength(1);
  });
});

describe("memoryRowsFor", () => {
  const input = {
    memories: [{ characterId: "n1", kind: "k", body: "b1" }, { characterId: "m1", kind: "k", body: "b2" }, { characterId: "x", kind: "k", body: "b3" }],
    npcIds: new Set(["n1"]), memberIds: new Set(["m1"]), campaignId: "c", userId: "u", campaignSessionId: "cs", provenance,
  };
  it("files each memory in its own ledger and drops an id that is neither of this campaign", () => {
    const { npcRows, memberRows } = memoryRowsFor(input);
    expect(npcRows).toEqual([expect.objectContaining({ npc_id: "n1", body: "b1", campaign_id: "c", user_id: "u", session_id: "cs" })]);
    expect(memberRows).toEqual([expect.objectContaining({ party_member_id: "m1", body: "b2" })]);
  });
});

describe("foundCharacters", () => {
  it("a character found by name and by disguise is listed once, under the name the party knows", () => {
    const n = { id: "n", name: "Vane", disguise_name: "Tom", is_revealed: false };
    expect(foundCharacters([n], [n])).toEqual([{ id: "n", shownName: "Tom" }]);
    expect(foundCharacters([{ ...n, is_revealed: true }], [])).toEqual([{ id: "n", shownName: "Vane" }]);
  });
});

describe("afterUse", () => {
  it("one of two leaves one; the last one deletes the row", () => {
    expect(afterUse(2)).toEqual({ kind: "update", quantity: 1 });
    expect(afterUse(1)).toEqual({ kind: "delete" });
  });
});

describe("isUntouchedTableCharacter", () => {
  it("only a record the table made and nobody edited may be rewritten", () => {
    expect(isUntouchedTableCharacter({ generatorType: "agent_turn_character", edited: false })).toBe(true);
    expect(isUntouchedTableCharacter({ generatorType: "agent_turn_character", edited: true })).toBe(false);
    expect(isUntouchedTableCharacter({ generatorType: "generate_npc", edited: false })).toBe(false);
    expect(isUntouchedTableCharacter(null)).toBe(false);
  });
});

describe("character writes", () => {
  it("a rewrite keeps the occupation unless one was given", () => {
    expect(characterRewrite({ about: "a", occupation: null }, provenance)).not.toHaveProperty("occupation");
    expect(characterRewrite({ about: "a", occupation: "smith" }, provenance)).toMatchObject({ occupation: "smith", backstory: "a" });
  });
  const intro = { name: "N", occupation: null, about: "a", here: true, known: true };
  const ctx = { userId: "u", campaignId: "c", locationId: "L", memberId: "m" };
  it("a new character is placed here only when here, and shown to the player's character only when known", () => {
    expect(characterInsert(ctx, intro, provenance)).toMatchObject({ location_id: "L", player_visible_to: ["m"] });
    expect(characterInsert(ctx, { ...intro, here: false, known: false }, provenance)).toMatchObject({ location_id: null, player_visible_to: [] });
    expect(characterInsert({ ...ctx, memberId: null }, intro, provenance).player_visible_to).toEqual([]);
  });
});

describe("profileWithBelongings", () => {
  it("carries belongings after the profile only when there are some", () => {
    expect(profileWithBelongings("P", null)).toBe("P");
    expect(profileWithBelongings("P", "B")).toBe("P\n\nB");
  });
});
