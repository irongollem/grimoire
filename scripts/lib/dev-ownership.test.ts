import { describe, expect, it } from "vitest";

import { andFilters, detachMissingSpecies, type FkRule, ownershipFilter, pruneForeignRows, type Rows, remapToFixture, speciesIdsReferenced } from "./dev-ownership";

const SOURCE = "12121212-3434-5656-7878-909090909090";

describe("ownershipFilter", () => {
  it("restricts user_id exactly", () => {
    expect(ownershipFilter("npcs", ["id", "user_id", "name"], SOURCE)).toBe(`user_id=eq.${SOURCE}`);
  });

  it.each(["quest_beats", "quest_beat_edges", "quest_beat_attachments", "quest_clocks", "loot_placements"])(
    "accepts an unrecorded author only for allowlisted %s",
    (table) => {
      expect(ownershipFilter(table, ["id", "created_by"], SOURCE)).toBe(`or=(created_by.eq.${SOURCE},created_by.is.null)`);
      expect(ownershipFilter(table, ["user_id", "created_by"], SOURCE)).toBe(
        `user_id=eq.${SOURCE}&or=(created_by.eq.${SOURCE},created_by.is.null)`,
      );
    },
  );

  it.each(["quest_threads", "future_table"])("requires an exact creator for %s", (table) => {
    expect(ownershipFilter(table, ["id", "created_by"], SOURCE)).toBe(`created_by=eq.${SOURCE}`);
    expect(ownershipFilter(table, ["user_id", "created_by"], SOURCE)).toBe(
      `user_id=eq.${SOURCE}&created_by=eq.${SOURCE}`,
    );
  });

  it("filters nothing for a table with neither, and refuses a source that is not a uuid", () => {
    expect(ownershipFilter("quest_threads", ["id", "campaign_id"], SOURCE)).toBe("");
    expect(() => ownershipFilter("npcs", ["user_id"], "x&user_id=neq.1")).toThrow(/uuid/);
  });
});

describe("andFilters", () => {
  it("joins the non-empty filters", () => {
    expect(andFilters("a=1", "", "b=2")).toBe("a=1&b=2");
    expect(andFilters("", "")).toBe("");
  });
});

const rule = (over: Partial<FkRule> & Pick<FkRule, "table" | "column" | "refTable">): FkRule => ({
  refColumn: "id",
  nullable: false,
  kind: "kept",
  allowed: new Set<string>(),
  ...over,
});

describe("pruneForeignRows", () => {
  it("drops a row that points at a row that was not kept", () => {
    const tables: Record<string, Rows> = {
      party_members: [{ id: "pc1" }],
      npc_relationships: [
        { id: "r1", pc_id: "pc1" },
        { id: "r2", pc_id: "player-pc" },
      ],
    };
    const report = pruneForeignRows(tables, [rule({ table: "npc_relationships", column: "pc_id", refTable: "party_members" })]);
    expect(tables.npc_relationships.map((r) => r.id)).toEqual(["r1"]);
    expect(report.pruned).toEqual({ npc_relationships: 1 });
  });

  it("repeats until stable: dropping a parent strands its children", () => {
    const tables: Record<string, Rows> = {
      factions: [{ id: "f1", leader_id: "gone" }],
      faction_items: [{ id: "i1", faction_id: "f1" }],
      faction_notes: [{ id: "n1", item_id: "i1" }],
      npcs: [],
    };
    const report = pruneForeignRows(tables, [
      // Listed child-first on purpose: one pass in this order would miss the grandchild.
      rule({ table: "faction_notes", column: "item_id", refTable: "faction_items" }),
      rule({ table: "faction_items", column: "faction_id", refTable: "factions" }),
      rule({ table: "factions", column: "leader_id", refTable: "npcs" }),
    ]);
    expect(tables.factions).toEqual([]);
    expect(tables.faction_items).toEqual([]);
    expect(tables.faction_notes).toEqual([]);
    expect(report.pruned).toEqual({ factions: 1, faction_items: 1, faction_notes: 1 });
  });

  it("follows a required self-reference down a tree", () => {
    const tables: Record<string, Rows> = {
      locations: [
        { id: "a", parent_id: "a" },
        { id: "b", parent_id: "a" },
        { id: "c", parent_id: "missing" },
        { id: "d", parent_id: "c" },
      ],
    };
    pruneForeignRows(tables, [rule({ table: "locations", column: "parent_id", refTable: "locations", nullable: false })]);
    expect(tables.locations.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("empties a nullable reference to a row that was not kept, and keeps the row and its children", () => {
    const tables: Record<string, Rows> = {
      monsters: [],
      npcs: [{ id: "n1", linked_monster_id: "account-level-monster" }],
      locations: [
        { id: "c", parent_id: "missing" },
        { id: "d", parent_id: "c" },
      ],
    };
    const report = pruneForeignRows(tables, [
      rule({ table: "npcs", column: "linked_monster_id", refTable: "monsters", nullable: true }),
      rule({ table: "locations", column: "parent_id", refTable: "locations", nullable: true }),
    ]);
    expect(tables.npcs).toEqual([{ id: "n1", linked_monster_id: null }]);
    expect(tables.locations).toEqual([{ id: "c", parent_id: null }, { id: "d", parent_id: "c" }]);
    expect(report.pruned).toEqual({});
  });

  it("empties a nullable column aimed at an account that is not the source, keeping the row", () => {
    const tables: Record<string, Rows> = {
      party_members: [
        { id: "pc1", owner_user_id: "somebody-else" },
        { id: "pc2", owner_user_id: SOURCE },
        { id: "pc3", owner_user_id: null },
      ],
    };
    const report = pruneForeignRows(tables, [
      rule({ table: "party_members", column: "owner_user_id", refTable: "users", nullable: true, kind: "allowed", allowed: new Set([SOURCE]) }),
    ]);
    expect(tables.party_members.map((r) => r.owner_user_id)).toEqual([null, SOURCE, null]);
    expect(report.detached).toEqual({ "party_members.owner_user_id": 1 });
    expect(report.pruned).toEqual({});
  });

  it("prunes the row when the unpulled target is required", () => {
    const tables: Record<string, Rows> = { minis: [{ id: "m", session_id: "s" }] };
    pruneForeignRows(tables, [rule({ table: "minis", column: "session_id", refTable: "campaign_sessions", kind: "allowed" })]);
    expect(tables.minis).toEqual([]);
  });

  it("never prunes the campaign row: it empties the column", () => {
    const tables: Record<string, Rows> = { campaigns: [{ id: "c", current_location_id: "gone" }], locations: [] };
    const report = pruneForeignRows(tables, [
      rule({ table: "campaigns", column: "current_location_id", refTable: "locations", nullable: true }),
    ]);
    expect(tables.campaigns).toEqual([{ id: "c", current_location_id: null }]);
    expect(report.detached).toEqual({ "campaigns.current_location_id": 1 });
  });

  it("leaves a clean set alone", () => {
    const tables: Record<string, Rows> = { a: [{ id: "1" }], b: [{ id: "2", a_id: "1" }] };
    const report = pruneForeignRows(tables, [rule({ table: "b", column: "a_id", refTable: "a" })]);
    expect(report).toEqual({ pruned: {}, detached: {} });
    expect(tables.b).toHaveLength(1);
  });
});

describe("remapToFixture", () => {
  const SOURCE = "11111111-1111-4111-8111-111111111111";
  const FIXTURE = "22222222-2222-4222-8222-222222222222";
  const CAMPAIGN = "33333333-3333-4333-8333-333333333333";
  const NPC = "44444444-4444-4444-8444-444444444444";
  const ELSEWHERE = "55555555-5555-4555-8555-555555555555";

  function fresh() {
    let n = 0;
    return () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++n).padStart(12, "0")}`;
  }

  it("gives every pulled row and the campaign a fresh id, and the fixture the source's rows", () => {
    const out = remapToFixture(
      { id: CAMPAIGN, user_id: SOURCE, name: "x" },
      [{ table: "npcs", rows: [{ id: NPC, campaign_id: CAMPAIGN, user_id: SOURCE }] }],
      SOURCE,
      FIXTURE,
      fresh(),
    );
    expect(out.campaign).toEqual({ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", user_id: FIXTURE, name: "x" });
    expect(out.rows.get("npcs")).toEqual([
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000002", campaign_id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", user_id: FIXTURE },
    ]);
  });

  it("keeps the source account's id inside a storage path, where the files actually live", () => {
    const url = `https://cdn.example/npc-portraits/${SOURCE}/abc.webp`;
    const out = remapToFixture({ id: CAMPAIGN, user_id: SOURCE }, [{ table: "npcs", rows: [{ id: NPC, user_id: SOURCE, portrait_url: url }] }], SOURCE, FIXTURE, fresh());
    expect(out.rows.get("npcs")![0]).toMatchObject({ user_id: FIXTURE, portrait_url: url });
  });

  it("follows references inside jsonb and arrays, and leaves what it did not pull alone", () => {
    const out = remapToFixture(
      { id: CAMPAIGN, user_id: SOURCE },
      [
        { table: "npcs", rows: [{ id: NPC }] },
        {
          table: "notes",
          rows: [{ id: "66666666-6666-4666-8666-666666666666", mentions: { npc: NPC, other: ELSEWHERE }, ids: [NPC], spell: "srd_command" }],
        },
      ],
      SOURCE,
      FIXTURE,
      fresh(),
    );
    const note = out.rows.get("notes")![0];
    const npcId = out.rows.get("npcs")![0].id;
    expect(note.mentions).toEqual({ npc: npcId, other: ELSEWHERE });
    expect(note.ids).toEqual([npcId]);
    expect(note.spell).toBe("srd_command");
  });
});

describe("species text references (#1034)", () => {
  const A = "a0a0a0a0-0000-4000-8000-000000000001";
  const B = "a0a0a0a0-0000-4000-8000-000000000002";

  it("collects only uuids from the three columns, scalars and arrays alike", () => {
    const tables: Record<string, Rows> = {
      party_members: [{ species_id: A, disguise_species_id: "srd_srd_2024_elf" }, { species_id: null }],
      campaigns: [{ disabled_species_ids: [B, "srd_srd_2024_dwarf"] }],
      npcs: [{ species_id: "a0a0a0a0-0000-4000-8000-0000000000ff" }],
    };
    expect([...speciesIdsReferenced(tables)].sort()).toEqual([A, B]);
  });

  it("empties a missing scalar, drops a missing array element, and keeps slugs and kept ids", () => {
    const tables: Record<string, Rows> = {
      party_members: [{ species_id: B, disguise_species_id: A }, { species_id: "srd_srd_2024_elf" }],
      campaigns: [{ disabled_species_ids: [A, B, "srd_srd_2024_dwarf"] }],
    };
    const detached = detachMissingSpecies(tables, new Set([A]));
    expect(tables.party_members).toEqual([{ species_id: null, disguise_species_id: A }, { species_id: "srd_srd_2024_elf" }]);
    expect(tables.campaigns![0]!.disabled_species_ids).toEqual([A, "srd_srd_2024_dwarf"]);
    expect(detached).toEqual({ "party_members.species_id": 1, "campaigns.disabled_species_ids": 1 });
  });
});
