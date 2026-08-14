import { describe, expect, it } from "vitest";
import { applyCampaignFilter, resolveImageColumn, validateFields } from "./tools.ts";
import { CREATABLE_TYPES, ENTITY_REGISTRY, ENTITY_TYPES } from "./registry.ts";

const quest = ENTITY_REGISTRY.quest;
const npc = ENTITY_REGISTRY.npc;
const item = ENTITY_REGISTRY.item;
const monster = ENTITY_REGISTRY.monster;
const spell = ENTITY_REGISTRY.spell;

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

  it("still rejects unknown fields on the newly writable types", () => {
    // The read-only types gained create blocks; the whitelist has to keep
    // holding for them, or `user_id` becomes smugglable on six more tables.
    expect(() => validateFields(item, { name: "x", user_id: "abc" }, { partial: false })).toThrow(/unknown field/i);
    expect(() => validateFields(monster, { name: "x", is_shared: true }, { partial: false })).toThrow(/unknown field/i);
  });

  it("enforces the numeric bounds that mirror a CHECK constraint", () => {
    // spells_level_check: 0..9. Caught here so the agent gets a sentence back
    // rather than a raw Postgres constraint-violation string.
    expect(validateFields(spell, { name: "Fireball", level: 3 }, { partial: false }).level).toBe(3);
    expect(validateFields(spell, { name: "Light", level: 0 }, { partial: false }).level).toBe(0);
    expect(() => validateFields(spell, { name: "x", level: 10 }, { partial: false })).toThrow(/at most 9/);
    expect(() => validateFields(spell, { name: "x", level: -1 }, { partial: false })).toThrow(/at least 0/);
    expect(() => validateFields(ENTITY_REGISTRY.party_member, { name: "x", level: 21 }, { partial: false }))
      .toThrow(/at most 20/);
  });

  it("validates uuid arrays element by element", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(validateFields(item, { name: "Scroll", spell_ids: [id] }, { partial: false }).spell_ids).toEqual([id]);
    expect(() => validateFields(item, { name: "Scroll", spell_ids: [id, "nope"] }, { partial: false }))
      .toThrow(/not a valid UUID/i);
    expect(() => validateFields(item, { name: "Scroll", spell_ids: "abc" }, { partial: false }))
      .toThrow(/array of UUID strings/i);
  });

  it("passes json fields through but rejects a stringified payload", () => {
    const sb = { armor_class: 15, hit_points: "8d8+16", challenge_rating: "5" };
    expect(validateFields(monster, { name: "Owlbear", stat_block: sb }, { partial: false }).stat_block).toEqual(sb);
    expect(validateFields(item, { name: "Sword", damage_rolls: [{ dice: "1d8", type: "slashing" }] }, { partial: false })
      .damage_rolls).toEqual([{ dice: "1d8", type: "slashing" }]);
    // The classic near-miss: JSON.stringify'ing the value before sending it.
    expect(() => validateFields(monster, { name: "x", stat_block: JSON.stringify(sb) }, { partial: false }))
      .toThrow(/not a string/i);
    expect(() => validateFields(monster, { name: "x", stat_block: 5 }, { partial: false }))
      .toThrow(/must be a JSON object/i);
  });

  it("refuses a type with no create block", () => {
    // Nothing in the registry is read-only today, but the guard is what makes
    // "omit `create` to keep it read-only" true, so it is exercised directly.
    const readOnly = { ...ENTITY_REGISTRY.note, type: "ledger", label: "Ledger", create: undefined };
    expect(() => validateFields(readOnly, { title: "x" }, { partial: false })).toThrow(/read-only/i);
  });

  it("lets a shared-library row be created with no campaign at all", () => {
    // The general-catalogue case: transcribing a magic item from a source that
    // belongs to no particular campaign.
    expect(validateFields(item, { name: "Bag of Holding", rarity: "uncommon" }, { partial: false }))
      .toEqual({ name: "Bag of Holding", rarity: "uncommon" });
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
  it("gives writes the same reach as reads", () => {
    // The six library types (item, monster, spell, trap, rule, party_member)
    // were listable, gettable and searchable but not writable, so an agentic
    // ingest could confirm a row was missing and then had to hand off to the
    // UI to add it. Any type added to the read enums from here on has to answer
    // the same question, which is what this asserts.
    expect([...CREATABLE_TYPES].sort()).toEqual([...ENTITY_TYPES].sort());
  });
});

describe("applyCampaignFilter", () => {
  // Stands in for the PostgREST builder: records the call instead of making one.
  const spy = () => {
    const calls: string[] = [];
    const q = {
      calls,
      eq: (col: string, val: string) => (calls.push(`eq:${col}=${val}`), q),
      or: (filters: string) => (calls.push(`or:${filters}`), q),
    };
    return q;
  };
  const cid = "123e4567-e89b-12d3-a456-426614174000";

  it("matches a campaign exactly when the row belongs to one", () => {
    expect(applyCampaignFilter(spy(), npc, cid).calls).toEqual([`eq:campaign_id=${cid}`]);
  });

  it("keeps the general catalogue when the table is a shared library", () => {
    // An `eq` here would answer "the items in this campaign" by hiding every
    // item the DM filed globally — i.e. nearly all of them.
    expect(applyCampaignFilter(spy(), item, cid).calls).toEqual([
      `or:campaign_id.is.null,campaign_id.eq.${cid}`,
    ]);
  });

  it("agrees with each entity's declared campaignScope", () => {
    for (const t of ENTITY_TYPES) {
      const def = ENTITY_REGISTRY[t];
      const [call] = applyCampaignFilter(spy(), def, cid).calls;
      expect(call.startsWith(def.campaignScope === "shared" ? "or:" : "eq:"), `${t} filtered with ${call}`).toBe(true);
    }
  });
});
