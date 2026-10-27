import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyCampaignFilter, audioRefusal, callTool, listTools, resolveClassDefinition, resolveImageColumn, validateFields } from "./tools.ts";
import { emptyDefenses, type Defenses, type StatBlockEntry } from "../../../../src/types/statBlock.types.ts";
import { CREATABLE_TYPES, ENTITY_REGISTRY, ENTITY_TYPES } from "./registry.ts";
import { createSupabaseFake, type SupabaseFake } from "../../../../src/test/supabaseFake.ts";

/**
 * A tool context over the fake: `from` is the fake's, plus the one thing it does
 * not model: `functions.invoke`. `ids` gives inserts into a table the id the
 * database would have generated (the fake generates none). `reply` is what the
 * edge function answers; `invoked` records each call.
 */
function mcpCtx(
  fake: SupabaseFake,
  opts: {
    ids?: Record<string, string>;
    invoked?: { fn: string; body: unknown }[];
    invokeError?: { message: string };
    reply?: { data: unknown; error: unknown };
  } = {},
): Ctx {
  const supabase = {
    from: (table: string) => {
      const q = fake.client.from(table);
      const id = opts.ids?.[table];
      const insert = q.insert.bind(q);
      return Object.assign(q, {
        insert: (rows: Record<string, unknown>, options?: unknown) => insert(id ? { id, ...rows } : rows, options),
        // The fake has no `not`; the one use here is "is not null", which `neq` is under Postgres semantics.
        not: (column: string) => q.neq(column, null),
      });
    },
    functions: {
      invoke: (fn: string, init: { body: unknown }) => {
        opts.invoked?.push({ fn, body: init.body });
        return Promise.resolve(opts.reply ?? { data: null, error: opts.invokeError ?? null });
      },
    },
  };
  return { userId: "dm-1", email: undefined, supabase } as unknown as Ctx;
}

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
    expect(validateFields(spell, { name: "Wish", level: 9 }, { partial: false }).level).toBe(9);
    expect(() => validateFields(spell, { name: "x", level: 10 }, { partial: false })).toThrow(/at most 9/);
    expect(() => validateFields(spell, { name: "x", level: -1 }, { partial: false })).toThrow(/at least 0/);
    expect(validateFields(ENTITY_REGISTRY.party_member, { name: "x", ruleset: "2024", level: 20 }, { partial: false }).level).toBe(20);
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
    expect(validateFields(monster, { name: "Owlbear", stat_block: sb }, { partial: false }).stat_block)
      .toEqual({ ...sb, defenses: emptyDefenses() });
    expect(validateFields(item, { name: "Sword", damage_rolls: [{ dice: "1d8", type: "slashing" }] }, { partial: false })
      .damage_rolls).toEqual([{ dice: "1d8", type: "slashing" }]);
    // The classic near-miss: JSON.stringify'ing the value before sending it.
    expect(() => validateFields(monster, { name: "x", stat_block: JSON.stringify(sb) }, { partial: false }))
      .toThrow(/not a string/i);
    expect(() => validateFields(monster, { name: "x", stat_block: 5 }, { partial: false }))
      .toThrow(/must be a JSON object/i);
  });

  it("rejects a monster stat block in the Open5e shape its readers cannot parse", () => {
    // The row that crashed StatBlockPanel (`saving_throws.split is not a function`).
    const bad = (extra: Record<string, unknown>) => () =>
      validateFields(monster, { name: "Memory-Magpie", stat_block: { armor_class: 13, ...extra } }, { partial: false });
    expect(bad({ saving_throws: { Dexterity: 6 } })).toThrow(/saving_throws must be a string like "Dex \+6, Wis \+3", not an object/);
    expect(bad({ condition_immunities: ["charmed"] })).toThrow(/condition_immunities must be a string .* not an array/);
    expect(bad({ skills: { stealth: 6 } })).toThrow(/skills\.stealth must be a string like "\+3", not a number/);
    expect(bad({ dex: "18" })).toThrow(/dex must be a number/);
    expect(bad({ actions: [{ name: "Bite" }] })).toThrow(/actions\[0\] must be \{name, description\}/);

    const good = {
      armor_class: 13, dex: 18, saving_throws: "Dex +6", skills: { stealth: "+6" },
      condition_immunities: "charmed, frightened", initiative_bonus: null,
      actions: [{ name: "Snatch", description: "Melee attack." }],
    };
    const stored = validateFields(monster, { name: "Memory-Magpie", stat_block: good }, { partial: false })
      .stat_block as Record<string, unknown>;
    expect(stored.saving_throws).toBe("Dex +6");
    expect(stored.condition_immunities).toBeUndefined();
    expect((stored.defenses as Defenses).condition_immunities).toEqual(["Charmed", "Frightened"]);
  });

  const BITE = "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d10 + 3) piercing damage.";
  const stat = (extra: Record<string, unknown>) =>
    validateFields(monster, { name: "Wolf", stat_block: { armor_class: 13, ...extra } }, { partial: false })
      .stat_block as Record<string, unknown> & { actions: StatBlockEntry[] };

  it("stores a prose stat block structured: an attack becomes kind attack, modifiers become defenses", () => {
    const stored = stat({ actions: [{ name: "Bite", description: BITE }], damage_resistances: "fire" });
    expect(stored.actions[0].structured.kind).toBe("attack");
    expect(stored.actions[0].structured.attack?.bonus).toBe(5);
    expect(stored.damage_resistances).toBeUndefined();
    expect((stored.defenses as Defenses).resistances[0].types).toEqual(["fire"]);
  });

  it("round-trips a stored block: sending back what get returned keeps it intact", () => {
    const once = stat({ actions: [{ name: "Bite", description: BITE }], damage_immunities: "poison" });
    const twice = stat(once);
    expect(twice).toEqual(once);
  });

  it("rejects garbage defenses or structured payloads", () => {
    const bad = (extra: Record<string, unknown>) => () => stat(extra);
    expect(bad({ defenses: "fire" })).toThrow(/defenses must be an object/);
    expect(bad({ defenses: { resistances: [{ types: "fire" }], immunities: [], vulnerabilities: [], condition_immunities: [] } }))
      .toThrow(/defenses\.resistances\[0\] must be/);
    expect(bad({ actions: [{ name: "Bite", description: BITE, structured: { kind: "bogus", source: "parsed" } }] }))
      .toThrow(/actions\[0\]\.structured kind must be one of/);
    expect(bad({ actions: [{ name: "Bite", description: BITE, structured: "attack" }] }))
      .toThrow(/actions\[0\]\.structured must be an object/);
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

describe("npc_memory", () => {
  const memory = ENTITY_REGISTRY.npc_memory;
  const id = "123e4567-e89b-12d3-a456-426614174000";

  it("is creatable with the ledger fields", () => {
    expect(CREATABLE_TYPES).toContain("npc_memory");
    const out = validateFields(
      memory,
      { npc_id: id, kind: "promise", body: " Owes Wren a favour. ", session_id: id, party_member_ids: [id], player_visible_to: [id] },
      { partial: false },
    );
    expect(out).toEqual({ npc_id: id, kind: "promise", body: "Owes Wren a favour.", session_id: id, party_member_ids: [id], player_visible_to: [id] });
  });

  it("accepts the secret block it discloses", () => {
    const secret_id = "223e4567-e89b-12d3-a456-426614174000";
    const out = validateFields(
      memory,
      { npc_id: id, kind: "revealed", body: "Told them of the crypt.", secret_entity_type: "location", secret_entity_id: id, secret_id },
      { partial: false },
    );
    expect(out).toMatchObject({ secret_entity_type: "location", secret_entity_id: id, secret_id });
    expect(() =>
      validateFields(memory, { npc_id: id, kind: "revealed", body: "x", secret_entity_type: "npc" }, { partial: false }),
    ).toThrow(/must be one of/i);
  });

  it("requires npc_id, kind and body, and rejects an unknown kind", () => {
    expect(() => validateFields(memory, { kind: "event", body: "x" }, { partial: false })).toThrow(/npc_id/);
    expect(() => validateFields(memory, { npc_id: id, kind: "gossip", body: "x" }, { partial: false })).toThrow(/must be one of/i);
  });

  it("refuses campaign_id with the reason", () => {
    expect(() => validateFields(memory, { npc_id: id, kind: "event", body: "x", campaign_id: id }, { partial: false })).toThrow(/set from npc_id/);
    expect(() => validateFields(memory, { campaign_id: id }, { partial: true })).toThrow(/set from npc_id/);
  });
});

describe("npc_memory — session on create", () => {
  const NPC_ID = "123e4567-e89b-12d3-a456-426614174010";
  const SESSION_ID = "123e4567-e89b-12d3-a456-426614174011";
  const OTHER_CAMPAIGN = "camp-2";
  let fake: SupabaseFake;

  beforeEach(() => {
    fake = createSupabaseFake();
    fake.seed("npcs", [
      { id: NPC_ID, campaign_id: "camp-1", name: "Mirela" },
      { id: "npc-elsewhere", campaign_id: OTHER_CAMPAIGN, name: "Bram" },
    ]);
  });

  const create = (fields: Record<string, unknown>) =>
    callTool(mcpCtx(fake, { ids: { npc_memories: "mem-1" } }), "create", {
      type: "npc_memory",
      fields: { npc_id: NPC_ID, kind: "event", body: "Paid in full.", ...fields },
    });
  const filed = () => fake.rows("npc_memories")[0];

  it("files a memory without a session under the NPC's campaign's running one, not another campaign's", async () => {
    fake.seed("campaign_sessions", [
      { id: SESSION_ID, campaign_id: "camp-1", started_at: "2026-10-01T18:00:00Z", ended_at: null },
      { id: "elsewhere-running", campaign_id: OTHER_CAMPAIGN, started_at: "2026-10-01T18:00:00Z", ended_at: null },
    ]);
    await create({});
    expect(filed()).toMatchObject({ npc_id: NPC_ID, session_id: SESSION_ID, user_id: "dm-1" });
  });

  it("does not file under a session that has ended or not begun", async () => {
    fake.seed("campaign_sessions", [
      { id: "over", campaign_id: "camp-1", started_at: "2026-09-01T18:00:00Z", ended_at: "2026-09-01T22:00:00Z" },
      { id: "planned", campaign_id: "camp-1", started_at: null, ended_at: null },
    ]);
    await create({});
    expect(filed()).not.toHaveProperty("session_id");
  });

  it("leaves it outside any session when none is running in that campaign", async () => {
    fake.seed("campaign_sessions", [
      { id: "elsewhere-running", campaign_id: OTHER_CAMPAIGN, started_at: "2026-10-01T18:00:00Z", ended_at: null },
    ]);
    await create({});
    expect(filed()).not.toHaveProperty("session_id");
  });

  it("keeps a session the caller named", async () => {
    const named = "123e4567-e89b-12d3-a456-426614174012";
    fake.seed("campaign_sessions", [{ id: SESSION_ID, campaign_id: "camp-1", started_at: "2026-10-01T18:00:00Z", ended_at: null }]);
    await create({ session_id: named });
    expect(filed()).toMatchObject({ session_id: named });
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

describe("create/update — embed-on-write (#838)", () => {
  const ROW_ID = "123e4567-e89b-12d3-a456-426614174000";
  const OTHER_ID = "223e4567-e89b-12d3-a456-426614174000";
  let fake: SupabaseFake;
  let invoked: { fn: string; body: unknown }[];

  /** `embedError` makes the embedding call fail, to prove a write still succeeds without it. */
  function ctx(embedError?: { message: string }) {
    return mcpCtx(fake, { ids: { items: ROW_ID, monsters: ROW_ID, quests: ROW_ID }, invoked, invokeError: embedError });
  }

  beforeEach(() => {
    fake = createSupabaseFake();
    invoked = [];
  });

  it("queues a created item for embedding, and stamps it with the caller as owner", async () => {
    const row = await callTool(ctx(), "create", { type: "item", fields: { name: "Psi Crystal" } });
    expect(row).toMatchObject({ id: ROW_ID, user_id: "dm-1" });
    expect(invoked).toEqual([
      { fn: "embed-content", body: { mode: "single", entity: "item", id: ROW_ID } },
    ]);
  });

  it("routes monsters to their own edge function, which takes monster_id", async () => {
    await callTool(ctx(), "create", { type: "monster", fields: { name: "Owlbear" } });
    expect(invoked).toEqual([{ fn: "embed-monsters", body: { mode: "single", monster_id: ROW_ID } }]);
  });

  it("queues an updated row too, and changes only the row named", async () => {
    fake.seed("items", [
      { id: ROW_ID, name: "Psi Crystal", description: "", user_id: "dm-1" },
      { id: OTHER_ID, name: "Other", description: "", user_id: "dm-1" },
    ]);
    await callTool(ctx(), "update", { type: "item", id: ROW_ID, fields: { description: "It hums." } });
    expect(fake.rows("items").find((r) => r.id === ROW_ID)).toMatchObject({ description: "It hums." });
    expect(fake.rows("items").find((r) => r.id === OTHER_ID)).toMatchObject({ description: "" });
    expect(invoked).toEqual([
      { fn: "embed-content", body: { mode: "single", entity: "item", id: ROW_ID } },
    ]);
  });

  it("reports an update of a row that is not there, and embeds nothing", async () => {
    await expect(callTool(ctx(), "update", { type: "item", id: ROW_ID, fields: { description: "x" } })).rejects.toThrow(/No .* found/);
    expect(invoked).toEqual([]);
  });

  it("makes no call for a type with no corpus", async () => {
    await callTool(ctx(), "create", { type: "quest", fields: { title: "The Bell" } });
    expect(invoked).toEqual([]);
  });

  it("still returns the written row when embedding fails", async () => {
    await expect(callTool(ctx({ message: "embedding_provider_unavailable" }), "create", { type: "item", fields: { name: "Psi Crystal" } }))
      .resolves.toMatchObject({ id: ROW_ID, name: "Psi Crystal" });
  });

  it("declares embedOnWrite for exactly the types that have a corpus", () => {
    // Pinned rather than derived: the corpora live in embed-content's own
    // registry, which this file cannot import. A seventh entity type gaining
    // vectors should be a deliberate edit here, not a silent omission — the
    // failure mode is invisible (rows write fine and are simply never found).
    const embedded = ENTITY_TYPES.filter((t) => ENTITY_REGISTRY[t].embedOnWrite).sort();
    expect(embedded).toEqual(["faction", "item", "location", "monster", "note", "npc"]);
  });

  it("gives every embeddable type a create block — an unwritable type cannot need the hook", () => {
    for (const t of ENTITY_TYPES) {
      if (!ENTITY_REGISTRY[t].embedOnWrite) continue;
      expect(CREATABLE_TYPES, `${t} declares embedOnWrite but is read-only`).toContain(t);
    }
  });
});

describe("whoami", () => {
  function ctxWith(email: string | undefined) {
    const rows = [
      { id: "c-1", name: "Curse of Strahd", user_id: "dm-1" },
      { id: "c-2", name: "A friend's table", user_id: "dm-2" },
    ];
    const ctx = {
      userId: "dm-1",
      email,
      supabase: {
        from: () => ({ select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }),
      },
    };
    return ctx as unknown as Parameters<typeof callTool>[0];
  }

  it("names the account and splits the campaigns it can see into run and played", async () => {
    await expect(callTool(ctxWith("dm@example.invalid"), "whoami", {})).resolves.toEqual({
      user_id: "dm-1",
      email: "dm@example.invalid",
      campaigns_as_dm: [{ id: "c-1", name: "Curse of Strahd" }],
      campaigns_as_player: [{ id: "c-2", name: "A friend's table" }],
    });
  });

  it("reports a missing email as null rather than dropping the key", async () => {
    await expect(callTool(ctxWith(undefined), "whoami", {})).resolves.toMatchObject({ email: null });
  });
});

const CAMPAIGN = "123e4567-e89b-12d3-a456-426614174000";
const NPC_ID = "223e4567-e89b-12d3-a456-426614174000";
type Ctx = Parameters<typeof callTool>[0];

describe("new tools are listed", () => {
  it("offers the soundboard, audio and voice coach tools", () => {
    const names = listTools().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["soundboard", "get_audio", "voice_coach"]));
  });
});

describe("soundboard", () => {
  const OTHER_CAMPAIGN = "323e4567-e89b-12d3-a456-426614174000";
  let fake: SupabaseFake;
  const ctx = () => ({ userId: "dm-1", email: undefined, supabase: fake.client }) as unknown as Ctx;

  beforeEach(() => {
    fake = createSupabaseFake();
    fake.seed("soundboard_pages", [
      { id: "p1", campaign_id: CAMPAIGN, name: "Tavern", sort_order: 0 },
      { id: "p-other", campaign_id: OTHER_CAMPAIGN, name: "Someone else's page", sort_order: 0 },
    ]);
    fake.seed("soundboard_playlists", [
      {
        id: "pl1", campaign_id: CAMPAIGN, name: "Battle", playlist_type: "music", sort_order: 0,
        soundboard_playlist_tracks: [{ sound_id: "s2", sort_order: 1 }, { sound_id: "s1", sort_order: 0 }],
      },
      { id: "pl-other", campaign_id: OTHER_CAMPAIGN, name: "Someone else's playlist", playlist_type: "music", sort_order: 0, soundboard_playlist_tracks: [] },
    ]);
    fake.seed("sounds", [
      { id: "s1", campaign_id: CAMPAIGN, name: "Drums", sort_order: 0 },
      { id: "s2", campaign_id: CAMPAIGN, name: "Horns", sort_order: 1 },
      { id: "s-other", campaign_id: OTHER_CAMPAIGN, name: "Someone else's sound", sort_order: 0 },
    ]);
  });

  it("returns one campaign's pages, playlists with their sounds in play order, and sounds, and nothing from another campaign", async () => {
    const out = await callTool(ctx(), "soundboard", { campaign_id: CAMPAIGN });
    expect(out).toMatchObject({
      campaign_id: CAMPAIGN,
      pages: [{ id: "p1", name: "Tavern" }],
      playlists: [{ id: "pl1", name: "Battle", track_sound_ids: ["s1", "s2"] }],
      sounds: [{ id: "s1", name: "Drums" }, { id: "s2", name: "Horns" }],
    });
    expect(JSON.stringify(out)).not.toContain("Someone else");
  });

  it("throws a read error rather than reporting an empty board", async () => {
    fake.failNext("soundboard_playlists", { message: "permission denied" });
    await expect(callTool(ctx(), "soundboard", { campaign_id: CAMPAIGN })).rejects.toThrow("permission denied");
  });

  it("requires a campaign, and reads nothing without one", async () => {
    await expect(callTool(ctx(), "soundboard", {})).rejects.toThrow(/campaign_id/);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("search", () => {
  /** A query builder that records what each table was asked, and finds nothing. */
  function searchCtx() {
    const asked: { table: string; or: string[]; limit: number[]; eq: string[] }[] = [];
    const supabase = {
      from: (table: string) => {
        const rec = { table, or: [] as string[], limit: [] as number[], eq: [] as string[] };
        asked.push(rec);
        const q = {
          select: () => q,
          or: (filter: string) => (rec.or.push(filter), q),
          eq: (column: string, value: string) => (rec.eq.push(`${column}=${value}`), q),
          limit: (n: number) => (rec.limit.push(n), q),
          overrideTypes: () => Promise.resolve({ data: [], error: null }),
        };
        return q;
      },
    };
    return { ctx: { userId: "dm-1", email: undefined, supabase } as unknown as Ctx, asked };
  }

  it("keeps PostgREST filter syntax in the DM's text from becoming syntax in the filter", async () => {
    const { ctx, asked } = searchCtx();
    await callTool(ctx, "search", { query: 'a),user_id.eq.x,(b*%\\":c', types: ["npc"] });
    const [filter] = asked[0].or;
    // One ilike per search field, joined by commas and nothing the DM typed.
    const clauses = filter.split(",");
    expect(clauses).toHaveLength(ENTITY_REGISTRY.npc.searchFields.length);
    for (const clause of clauses) expect(clause).toMatch(/^[a-z_]+\.ilike\.\*[^,()*%\\":]+\*$/);
  });

  it("refuses a query that is only syntax", async () => {
    const { ctx, asked } = searchCtx();
    await expect(callTool(ctx, "search", { query: "(),*%" })).rejects.toThrow(/searchable text/);
    expect(asked).toHaveLength(0);
  });

  it.each([
    [1000, 50],
    [0, 1],
    [undefined, 8],
  ])("asks each table for at most the clamped limit (limit %s -> %s)", async (limit, expected) => {
    const { ctx, asked } = searchCtx();
    await callTool(ctx, "search", { query: "bell", types: ["npc", "quest"], limit });
    expect(asked.map((a) => a.limit)).toEqual([[expected], [expected]]);
  });

  it("narrows to one campaign when asked, and refuses a campaign that is not a UUID", async () => {
    const { ctx, asked } = searchCtx();
    await callTool(ctx, "search", { query: "bell", types: ["npc"], campaign_id: CAMPAIGN });
    expect(asked[0].eq).toEqual([`campaign_id=${CAMPAIGN}`]);
    await expect(callTool(ctx, "search", { query: "bell", campaign_id: "x,y" })).rejects.toThrow(/valid UUID/);
  });
});

describe("audioRefusal", () => {
  const g = globalThis as typeof globalThis & { Deno?: { env: { get(k: string): string | undefined } } };
  beforeEach(() => {
    const env: Record<string, string> = { SUPABASE_URL: "https://ref.supabase.co", ASSET_CDN_URL: "https://cdn.example.com" };
    g.Deno = { env: { get: (k: string) => env[k] } };
  });
  afterEach(() => {
    delete g.Deno;
  });

  it("fetches our own uploads and library sounds, from the CDN or the origin", () => {
    expect(audioRefusal({ source_type: "upload", file_url: "https://cdn.example.com/sounds/u1/a.mp3" })).toBeNull();
    expect(audioRefusal({ source_type: "library", file_url: "https://ref.supabase.co/storage/v1/object/public/sounds/library/x.ogg" })).toBeNull();
  });

  it("sends Spotify back as a link, never a fetch", () => {
    expect(audioRefusal({ source_type: "spotify", file_url: "https://open.spotify.com/track/1" })).toMatch(/Spotify/);
  });

  it("never proxies another host, whatever the source says it is", () => {
    expect(audioRefusal({ source_type: "freesound", file_url: "https://cdn.freesound.org/previews/1/1.mp3" })).toMatch(/externally/);
    expect(audioRefusal({ source_type: "upload", file_url: "http://169.254.169.254/latest" })).toMatch(/externally/);
  });
});

describe("voice_coach", () => {
  const OTHER_NPC = "323e4567-e89b-12d3-a456-426614174000";
  const OTHER_CAMPAIGN = "423e4567-e89b-12d3-a456-426614174000";
  let fake: SupabaseFake;
  let calls: { fn: string; body: unknown }[];

  beforeEach(() => {
    fake = createSupabaseFake();
    calls = [];
    fake.seed("npcs", [
      { id: NPC_ID, name: "Mirela", campaign_id: CAMPAIGN },
      { id: OTHER_NPC, name: "Bram", campaign_id: OTHER_CAMPAIGN },
    ]);
  });

  const coach = (args: Record<string, unknown>, reply?: { data: unknown; error: unknown }) =>
    callTool(mcpCtx(fake, { invoked: calls, reply }), "voice_coach", args);

  it("asks generate-npc-voice in the NPC's own campaign, not another NPC's, and returns its lines", async () => {
    await expect(
      coach({ npc_id: NPC_ID, situation: " Where did it go? " }, { data: { lines: ["Ask the harbourmaster.", "What shipment?"] }, error: null }),
    ).resolves.toEqual({ npc_id: NPC_ID, lines: ["Ask the harbourmaster.", "What shipment?"] });
    expect(calls).toEqual([
      { fn: "generate-npc-voice", body: { campaign_id: CAMPAIGN, npc_id: NPC_ID, situation: "Where did it go?" } },
    ]);
  });

  it("reports a refusal in words, not as a bare non-2xx", async () => {
    await expect(
      coach({ npc_id: NPC_ID, situation: "Hi" }, {
        data: null,
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: new Response(JSON.stringify({ error: "insufficient_credits", balance: 0 })),
        },
      }),
    ).rejects.toThrow(/Insufficient credits \(0 left\)/);
  });

  it("refuses an NPC outside any campaign before spending anything", async () => {
    fake.seed("npcs", [{ id: "223e4567-e89b-12d3-a456-426614174099", name: "Hermit", campaign_id: null }]);
    await expect(coach({ npc_id: "223e4567-e89b-12d3-a456-426614174099", situation: "Hi" })).rejects.toThrow(/no campaign/);
    expect(calls).toEqual([]);
  });

  it("validates its arguments, and spends nothing on an NPC that is not there", async () => {
    await expect(coach({ npc_id: "nope", situation: "Hi" })).rejects.toThrow(/UUID/);
    await expect(coach({ npc_id: NPC_ID, situation: "  " })).rejects.toThrow(/situation/);
    await expect(coach({ npc_id: "523e4567-e89b-12d3-a456-426614174000", situation: "Hi" })).rejects.toThrow(/No NPC found/);
    expect(calls).toEqual([]);
  });
});

describe("party_member — ruleset and class", () => {
  const MEMBER_ID = "123e4567-e89b-12d3-a456-426614174001";
  const CAMPAIGN_ID = "123e4567-e89b-12d3-a456-426614174002";
  const member = ENTITY_REGISTRY.party_member;

  const MEMBER = MEMBER_ID;
  let fake: SupabaseFake;

  beforeEach(() => {
    fake = createSupabaseFake();
    // 2014 rows come first so a lookup that forgets the edition finds the wrong one.
    fake.seed("system_classes", [
      { id: "sys-fighter-2014", class_name: "Fighter", ruleset: "2014" },
      { id: "sys-fighter-2024", class_name: "Fighter", ruleset: "2024" },
      { id: "sys-wizard-2024", class_name: "Wizard", ruleset: "2024" },
    ]);
    fake.seed("custom_classes", [
      { id: "cus-tinker", class_name: "Tinkerer", ruleset: null, user_id: "dm-1", campaign_id: null },
      { id: "cus-other", class_name: "Hexblade-ish", ruleset: null, user_id: "dm-2", campaign_id: null },
    ]);
  });

  const ctx = () => mcpCtx(fake, { ids: { party_members: MEMBER } });
  const make = (fields: Record<string, unknown>) => callTool(ctx(), "create", { type: "party_member", fields });
  const ops = () => fake.calls.filter((c) => c.op !== "select").map((c) => `${c.target}:${c.op}`);

  it("requires a ruleset and limits it to the two editions", () => {
    expect(() => validateFields(member, { name: "Ayla" }, { partial: false })).toThrow(/ruleset/);
    expect(() => validateFields(member, { name: "Ayla", ruleset: "2020" }, { partial: false })).toThrow(/must be one of/i);
    expect(validateFields(member, { name: "Ayla", ruleset: "2024" }, { partial: false }).ruleset).toBe("2024");
  });

  it("refuses subclass on create with the reason", () => {
    expect(() => validateFields(member, { name: "Ayla", ruleset: "2024", subclass: "Champion" }, { partial: false })).toThrow(
      /chosen in the app/,
    );
  });

  it("refuses class, subclass and ruleset on update", () => {
    expect(() => validateFields(member, { class: "Wizard" }, { partial: true })).toThrow(/levelling up or down in the app/);
    expect(() => validateFields(member, { subclass: "Evoker" }, { partial: true })).toThrow(/levelling up or down in the app/);
    expect(() => validateFields(member, { ruleset: "2014" }, { partial: true })).toThrow(/fixed when it is created/);
    expect(validateFields(member, { notes: "ok" }, { partial: true })).toEqual({ notes: "ok" });
  });

  it("pins the official class of the character's own edition and keeps class out of the member insert", async () => {
    await make({ name: "Ayla", ruleset: "2024", class: "fighter", level: 3 });
    const [member] = fake.rows("party_members");
    expect(member).toMatchObject({ id: MEMBER, name: "Ayla", ruleset: "2024", level: 3, user_id: "dm-1" });
    expect(member).not.toHaveProperty("class");
    expect(fake.rows("character_classes")).toEqual([{
      party_member_id: MEMBER,
      class_name: "Fighter",
      class_definition_id: "sys-fighter-2024",
      class_definition_kind: "system",
      levels: 3,
      is_primary: true,
      sort_order: 0,
      hit_dice_used: 0,
    }]);
  });

  it("refuses a class the caller scoped to another campaign, and prefers the campaign's own", async () => {
    fake.seed("custom_classes", [
      { id: "cus-elsewhere", class_name: "Rune Smith", ruleset: null, user_id: "dm-1", campaign_id: "other-campaign" },
      { id: "cus-general", class_name: "Glassblower", ruleset: null, user_id: "dm-1", campaign_id: null },
      { id: "cus-here", class_name: "Glassblower", ruleset: null, user_id: "dm-2", campaign_id: CAMPAIGN_ID },
    ]);
    await expect(resolveClassDefinition(ctx(), "2024", "Rune Smith", CAMPAIGN_ID)).rejects.toThrow(/No 2024 class named/);
    await expect(resolveClassDefinition(ctx(), "2024", "Glassblower", CAMPAIGN_ID)).resolves.toMatchObject({ id: "cus-here" });
    await expect(resolveClassDefinition(ctx(), "2024", "Glassblower", null)).resolves.toMatchObject({ id: "cus-general" });
  });

  it("falls back to the caller's own class, at level 1 when none is given", async () => {
    await make({ name: "Ayla", ruleset: "2014", class: "Tinkerer", campaign_id: CAMPAIGN_ID });
    expect(fake.rows("character_classes")[0]).toMatchObject({ class_definition_id: "cus-tinker", class_definition_kind: "custom", levels: 1 });
  });

  it("does not resolve a custom class tied to the other edition", async () => {
    fake.seed("custom_classes", [{ id: "cus-2014-only", class_name: "Gunsmith", ruleset: "2014", user_id: "dm-1", campaign_id: null }]);
    await expect(make({ name: "Ayla", ruleset: "2024", class: "Gunsmith" })).rejects.toThrow(/No 2024 class named "Gunsmith"/);
    await make({ name: "Ayla", ruleset: "2014", class: "Gunsmith" });
    expect(fake.rows("character_classes")[0]).toMatchObject({ class_definition_id: "cus-2014-only" });
  });

  it("does not resolve another user's class", async () => {
    await expect(make({ name: "Ayla", ruleset: "2014", class: "Hexblade-ish" })).rejects.toThrow(/No 2014 class named "Hexblade-ish"/);
    expect(ops()).toEqual([]);
  });

  it("names the class and only the character's edition's official options when it resolves to nothing, writing nothing", async () => {
    const failure = make({ name: "Ayla", ruleset: "2024", class: "Gunslinger" });
    await expect(failure).rejects.toThrow(/"Gunslinger".*Fighter, Wizard/);
    await expect(make({ name: "Ayla", ruleset: "2014", class: "Gunslinger" })).rejects.toThrow(/Official 2014 classes: Fighter\./);
    expect(ops()).toEqual([]);
  });

  it("removes the character when its class row cannot be written", async () => {
    fake.failNext("character_classes", { message: "boom" });
    await expect(make({ name: "Ayla", ruleset: "2024", class: "Wizard" })).rejects.toThrow("boom");
    expect(fake.rows("party_members")).toEqual([]);
    expect(fake.rows("character_classes")).toEqual([]);
  });

  it("creates a classless character when no class is given", async () => {
    await make({ name: "Ayla", ruleset: "2024" });
    expect(ops()).toEqual(["party_members:insert"]);
  });
});
