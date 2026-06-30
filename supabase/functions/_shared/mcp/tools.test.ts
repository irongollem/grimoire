import { describe, expect, it } from "vitest";
import { resolveImageColumn, validateFields } from "./tools.ts";
import { CREATABLE_TYPES, ENTITY_REGISTRY } from "./registry.ts";

const quest = ENTITY_REGISTRY.quest;
const npc = ENTITY_REGISTRY.npc;
const monster = ENTITY_REGISTRY.monster; // read-only (no create block)

describe("validateFields — create", () => {
  it("accepts a valid payload and trims text", () => {
    const out = validateFields(quest, { title: "  Bell of Cuptown  ", summary: "ring it" }, { partial: false });
    expect(out).toEqual({ title: "Bell of Cuptown", summary: "ring it" });
  });

  it("rejects a missing required field", () => {
    expect(() => validateFields(quest, { summary: "no title" }, { partial: false })).toThrow(/required/i);
  });

  it("treats an empty required string as missing", () => {
    expect(() => validateFields(quest, { title: "   " }, { partial: false })).toThrow(/required/i);
  });

  it("rejects unknown fields (typos, or smuggled user_id/id)", () => {
    expect(() => validateFields(quest, { title: "x", user_id: "abc" }, { partial: false })).toThrow(/unknown field/i);
    expect(() => validateFields(quest, { title: "x", id: "abc" }, { partial: false })).toThrow(/unknown field/i);
  });

  it("validates enum values", () => {
    expect(validateFields(quest, { title: "x", status: "completed" }, { partial: false }).status).toBe("completed");
    expect(() => validateFields(quest, { title: "x", status: "bogus" }, { partial: false })).toThrow(/must be one of/i);
  });

  it("validates uuid shape", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(validateFields(quest, { title: "x", campaign_id: id }, { partial: false }).campaign_id).toBe(id);
    expect(() => validateFields(quest, { title: "x", campaign_id: "not-a-uuid" }, { partial: false })).toThrow(/uuid/i);
  });

  it("coerces numbers and validates ranges of type", () => {
    expect(validateFields(npc, { name: "Bob", relevance: 4 }, { partial: false }).relevance).toBe(4);
    expect(() => validateFields(npc, { name: "Bob", relevance: "high" }, { partial: false })).toThrow(/number/i);
  });

  it("drops blank numeric strings as absence rather than coercing them to 0", () => {
    // Number("") === 0 and Number("  ") === 0 — must NOT be written as relevance 0;
    // a blank value means "not provided", so the field is left to its DB default.
    expect(validateFields(npc, { name: "Bob", relevance: "" }, { partial: false })).toEqual({ name: "Bob" });
    expect(validateFields(npc, { name: "Bob", relevance: "  " }, { partial: false })).toEqual({ name: "Bob" });
    // A non-blank, non-numeric value is still a hard error.
    expect(() => validateFields(npc, { name: "Bob", relevance: "high" }, { partial: false })).toThrow(/number/i);
  });

  it("treats a blank uuid as absence rather than passing '' to the DB", () => {
    // An empty campaign_id must be dropped (left null), not sent as '' → raw cast error.
    expect(validateFields(quest, { title: "x", campaign_id: "" }, { partial: false })).toEqual({ title: "x" });
    expect(validateFields(quest, { title: "x", campaign_id: "   " }, { partial: false })).toEqual({ title: "x" });
  });

  it("flags a required field whose only value was a blank uuid", () => {
    // pantheon.campaign_id is required; a blank string must count as missing.
    expect(() => validateFields(ENTITY_REGISTRY.pantheon, { name: "Olympus", campaign_id: "" }, { partial: false })).toThrow(/required/i);
  });

  it("trims whitespace-padded enum values", () => {
    expect(validateFields(quest, { title: "x", status: " completed " }, { partial: false }).status).toBe("completed");
  });

  it("validates string arrays", () => {
    expect(validateFields(npc, { name: "Bob", tags: ["a", "b"] }, { partial: false }).tags).toEqual(["a", "b"]);
    expect(() => validateFields(npc, { name: "Bob", tags: "a,b" }, { partial: false })).toThrow(/array of strings/i);
  });

  it("skips null/undefined values rather than writing them", () => {
    const out = validateFields(npc, { name: "Bob", notes: null, race: undefined }, { partial: false });
    expect(out).toEqual({ name: "Bob" });
  });

  it("refuses read-only entity types", () => {
    expect(() => validateFields(monster, { name: "Goblin" }, { partial: false })).toThrow(/read-only/i);
  });
});

describe("validateFields — update (partial)", () => {
  it("does not require required fields", () => {
    expect(validateFields(quest, { summary: "just the summary" }, { partial: true })).toEqual({ summary: "just the summary" });
  });

  it("requires at least one field", () => {
    expect(() => validateFields(quest, {}, { partial: true })).toThrow(/at least one/i);
  });
});

describe("resolveImageColumn", () => {
  it("defaults to the entity's first declared image when `which` is omitted", () => {
    expect(resolveImageColumn(npc, undefined)).toEqual({ which: "portrait", column: "portrait_url" });
    expect(resolveImageColumn(ENTITY_REGISTRY.location, "")).toEqual({ which: "image", column: "image_url" });
  });

  it("resolves an explicit, case-insensitive `which`", () => {
    expect(resolveImageColumn(npc, "disguise")).toEqual({ which: "disguise", column: "disguise_portrait_url" });
    expect(resolveImageColumn(ENTITY_REGISTRY.location, " MAP ")).toEqual({ which: "map", column: "map_url" });
  });

  it("rejects an unknown `which` with the valid options", () => {
    expect(() => resolveImageColumn(npc, "banner")).toThrow(/available: portrait, disguise/i);
  });

  it("rejects entities that carry no art", () => {
    expect(() => resolveImageColumn(ENTITY_REGISTRY.quest, "image")).toThrow(/no images/i);
    expect(() => resolveImageColumn(monster, undefined)).not.toThrow(); // monster DOES have art
  });
});

describe("registry creatable set", () => {
  it("exposes exactly the nine narrative entities as creatable", () => {
    expect([...CREATABLE_TYPES].sort()).toEqual(
      ["deity", "encounter", "faction", "location", "note", "npc", "pantheon", "puzzle", "quest"].sort(),
    );
  });
});
