import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCopyPlan, libraryReferencedIds, referencedIds, type ReferencedRow } from "./copyToCampaign";
import { BULK_SCOPE_QUERY_KEY, type BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";

const USER_ID = "user-1";
const TARGET_CAMPAIGN = "campaign-target";
const OTHER_CAMPAIGN = "campaign-other";

function refMap(rows: ReferencedRow[]): Map<string, ReferencedRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

// A syntactically valid uuid-shaped id for each referenced row, since
// USER_ROW_ID/isUuid-style discriminators in this module only check the
// "8 hex chars + dash" prefix, per content_integrity.sql.
const SPELL_VISIBLE = "aaaaaaaa-0000-0000-0000-000000000001";
const SPELL_OTHER_CAMPAIGN = "bbbbbbbb-0000-0000-0000-000000000002";
const SPELL_UNREADABLE = "cccccccc-0000-0000-0000-000000000003";
const SPELL_GENERAL = "dddddddd-0000-0000-0000-000000000004";
const LIBRARY_SLUG = "srd_fireball";

const REFERENCED = refMap([
  { id: SPELL_VISIBLE, name: "Chill Touch", campaignId: TARGET_CAMPAIGN },
  { id: SPELL_OTHER_CAMPAIGN, name: "Mage Hand", campaignId: OTHER_CAMPAIGN },
  { id: SPELL_GENERAL, name: "Light", campaignId: null },
  // SPELL_UNREADABLE intentionally absent — simulates an id the copying
  // account cannot read at all (RLS hid the row).
]);

describe("buildCopyPlan — universal shape", () => {
  const TABLES: BulkScopeTable[] = [
    "items",
    "monsters",
    "species",
    "spells",
    "traps",
    "puzzle_rooms",
    "loot_tables",
    "roll_tables",
  ];

  it.each(TABLES)("strips id/created_at/updated_at and re-scopes campaign_id + user_id for %s", (table) => {
    const row = {
      id: "src-row",
      user_id: "someone-else",
      created_at: "2020-01-01",
      updated_at: "2020-01-02",
      campaign_id: OTHER_CAMPAIGN,
      name: "Whatever",
    };
    const { payload } = buildCopyPlan(table, row, TARGET_CAMPAIGN, USER_ID, new Map());
    expect(payload.id).toBeUndefined();
    expect(payload.created_at).toBeUndefined();
    expect(payload.updated_at).toBeUndefined();
    expect(payload.campaign_id).toBe(TARGET_CAMPAIGN);
    expect(payload.user_id).toBe(USER_ID);
    // The name is never suffixed — a copy lands where the original is not.
    expect(payload.name).toBe("Whatever");
  });

  it.each(TABLES)("carries image columns through unchanged for %s", (table) => {
    const row = {
      id: "src-row",
      image_url: "https://cdn.example/monster-images/user-1/abc.webp",
      mundane_image_url: "https://cdn.example/item-images/user-1/def.webp",
    };
    const { payload } = buildCopyPlan(table, row, TARGET_CAMPAIGN, USER_ID, new Map());
    expect(payload.image_url).toBe(row.image_url);
    expect(payload.mundane_image_url).toBe(row.mundane_image_url);
  });

  it.each(["items", "spells", "monsters", "species"] as BulkScopeTable[])(
    "strips source_document_key/source_record_key/source_revision for %s (not campaign-scoped unique index)",
    (table) => {
      const row = {
        id: "src-row",
        source_document_key: "srd-2014",
        source_record_key: "fireball",
        source_revision: "1",
        source_title: "SRD 5.1",
        source: "srd-2014",
      };
      const { payload } = buildCopyPlan(table, row, TARGET_CAMPAIGN, USER_ID, new Map());
      expect(payload.source_document_key).toBeUndefined();
      expect(payload.source_record_key).toBeUndefined();
      expect(payload.source_revision).toBeUndefined();
      // Attribution fields are kept on purpose.
      expect(payload.source_title).toBe("SRD 5.1");
      expect(payload.source).toBe("srd-2014");
    },
  );

  it.each(["traps", "puzzle_rooms", "loot_tables", "roll_tables"] as BulkScopeTable[])(
    "has no source-identity columns to strip for %s",
    (table) => {
      const row = { id: "src-row", name: "Whatever" };
      const { payload } = buildCopyPlan(table, row, TARGET_CAMPAIGN, USER_ID, new Map());
      expect("source_document_key" in payload).toBe(false);
    },
  );
});

describe("buildCopyPlan — items", () => {
  it("carries content_updated_at off the payload (trigger-owned)", () => {
    const row = { id: "i1", content_updated_at: "2026-01-01T00:00:00Z" };
    const { payload } = buildCopyPlan("items", row, TARGET_CAMPAIGN, USER_ID, new Map());
    expect(payload.content_updated_at).toBeUndefined();
  });

  it("the visibility rule: target-scoped, general, other-campaign and unreadable spell_ids", () => {
    const row = { id: "i1", spell_ids: [SPELL_VISIBLE, SPELL_GENERAL, SPELL_OTHER_CAMPAIGN, SPELL_UNREADABLE] };
    const { payload, dropped } = buildCopyPlan("items", row, TARGET_CAMPAIGN, USER_ID, REFERENCED);
    expect(payload.spell_ids).toEqual([SPELL_VISIBLE, SPELL_GENERAL]);
    expect(dropped).toEqual([
      {
        label: "Linked spells",
        names: ["Mage Hand", "a row you no longer have access to"],
        removedEntries: false,
        entryNoun: { singular: "linked spell", plural: "linked spells" },
      },
    ]);
  });

  it("no drop report when every reference travels", () => {
    const row = { id: "i1", spell_ids: [SPELL_VISIBLE, SPELL_GENERAL] };
    const { dropped } = buildCopyPlan("items", row, TARGET_CAMPAIGN, USER_ID, REFERENCED);
    expect(dropped).toEqual([]);
  });
});

describe("buildCopyPlan — monsters", () => {
  const LOCATIONS = refMap([
    { id: "loc-visible", name: "The Sunken Keep", campaignId: TARGET_CAMPAIGN },
    { id: "loc-other", name: "Frosthaven", campaignId: OTHER_CAMPAIGN },
  ]);

  it("clears lair_location_id and reports it when the target campaign cannot see it", () => {
    const row = { id: "m1", lair_location_id: "loc-other" };
    const { payload, dropped } = buildCopyPlan("monsters", row, TARGET_CAMPAIGN, USER_ID, LOCATIONS);
    expect(payload.lair_location_id).toBeNull();
    expect(dropped).toEqual([
      {
        label: "Lair location",
        names: ["Frosthaven"],
        removedEntries: false,
        entryNoun: { singular: "lair location", plural: "lair locations" },
      },
    ]);
  });

  it("keeps lair_location_id when the target campaign can see it", () => {
    const row = { id: "m1", lair_location_id: "loc-visible" };
    const { payload, dropped } = buildCopyPlan("monsters", row, TARGET_CAMPAIGN, USER_ID, LOCATIONS);
    expect(payload.lair_location_id).toBe("loc-visible");
    expect(dropped).toEqual([]);
  });

  it("leaves a null lair_location_id alone", () => {
    const row = { id: "m1", lair_location_id: null };
    const { payload, dropped } = buildCopyPlan("monsters", row, TARGET_CAMPAIGN, USER_ID, LOCATIONS);
    expect(payload.lair_location_id).toBeNull();
    expect(dropped).toEqual([]);
  });
});

describe("buildCopyPlan — species (slug vs uuid split)", () => {
  it("a library slug always travels and is never looked up", () => {
    const row = {
      id: "sp1",
      granted_spells: [{ spell_id: LIBRARY_SLUG, spell_name: "Fireball", min_level: 1, source_label: "x" }],
    };
    // Empty referenced map — if the slug were looked up it would be treated
    // as unreadable and dropped. It must not be.
    const { payload, dropped } = buildCopyPlan("species", row, TARGET_CAMPAIGN, USER_ID, new Map());
    expect((payload.granted_spells as Array<{ spell_id: string }>)[0].spell_id).toBe(LIBRARY_SLUG);
    expect(dropped).toEqual([]);
  });

  it("a free-pick null spell_id always travels unchanged", () => {
    const row = { id: "sp1", granted_spells: [{ spell_id: null, spell_name: "Any cantrip", min_level: 1 }] };
    const { payload, dropped } = buildCopyPlan("species", row, TARGET_CAMPAIGN, USER_ID, new Map());
    expect((payload.granted_spells as Array<{ spell_id: string | null }>)[0].spell_id).toBeNull();
    expect(dropped).toEqual([]);
  });

  // Read this one against the test directly above it: there, `spell_id: null`
  // is a *free player pick*, which is what `SpeciesSpellGrant` documents it as.
  // So nulling the field here cannot mean "the link was dropped" — it would
  // mean "the player picks any spell", a strictly more generous rule that
  // reads as deliberate on the copy. The grant is removed instead.
  it("removes a grant whose spell the target campaign cannot see, rather than nulling it into a free pick", () => {
    const row = {
      id: "sp1",
      granted_spells: [
        { spell_id: SPELL_OTHER_CAMPAIGN, spell_name: "Mage Hand", min_level: 1 },
        { spell_id: SPELL_VISIBLE, spell_name: "Chill Touch", min_level: 1 },
      ],
    };
    const { payload, dropped } = buildCopyPlan("species", row, TARGET_CAMPAIGN, USER_ID, REFERENCED);
    const grants = payload.granted_spells as Array<{ spell_id: string | null; spell_name: string }>;
    expect(grants).toHaveLength(1);
    expect(grants[0].spell_id).toBe(SPELL_VISIBLE);
    expect(grants.some((g) => g.spell_id === null)).toBe(false);
    expect(dropped).toEqual([
      {
        label: "Granted spells",
        names: ["Mage Hand"],
        removedEntries: true,
        entryNoun: { singular: "granted spell", plural: "granted spells" },
      },
    ]);
  });

  it("a uuid spell_id the target campaign can see travels unchanged", () => {
    const row = { id: "sp1", granted_spells: [{ spell_id: SPELL_VISIBLE, spell_name: "Chill Touch" }] };
    const { payload, dropped } = buildCopyPlan("species", row, TARGET_CAMPAIGN, USER_ID, REFERENCED);
    expect((payload.granted_spells as Array<{ spell_id: string }>)[0].spell_id).toBe(SPELL_VISIBLE);
    expect(dropped).toEqual([]);
  });

  it("a bare legacy string element is removed outright when its target can't travel", () => {
    const row = { id: "sp1", granted_spells: [SPELL_OTHER_CAMPAIGN, LIBRARY_SLUG] };
    const { payload, dropped } = buildCopyPlan("species", row, TARGET_CAMPAIGN, USER_ID, REFERENCED);
    expect(payload.granted_spells).toEqual([LIBRARY_SLUG]);
    expect(dropped).toEqual([
      {
        label: "Granted spells",
        names: ["Mage Hand"],
        removedEntries: true,
        entryNoun: { singular: "granted spell", plural: "granted spells" },
      },
    ]);
  });
});

describe("buildCopyPlan — puzzle_rooms", () => {
  const LOOKUPS = refMap([
    { id: "loc-1", name: "The Sunken Keep", campaignId: TARGET_CAMPAIGN },
    { id: "feat-1", name: "Rune Door", campaignId: OTHER_CAMPAIGN },
  ]);

  it("clears location_id and dungeon_feature_id per the visibility rule", () => {
    const row = { id: "p1", location_id: "loc-1", dungeon_feature_id: "feat-1" };
    const { payload, dropped } = buildCopyPlan("puzzle_rooms", row, TARGET_CAMPAIGN, USER_ID, LOOKUPS);
    expect(payload.location_id).toBe("loc-1"); // visible, kept
    expect(payload.dungeon_feature_id).toBeNull(); // other campaign, dropped
    expect(dropped).toEqual([
      {
        label: "Dungeon feature",
        names: ["Rune Door"],
        removedEntries: false,
        entryNoun: { singular: "dungeon feature", plural: "dungeon features" },
      },
    ]);
  });

  it("always clears player_visible_to and is_shared, silently — never in the drop report", () => {
    const row = {
      id: "p1",
      player_visible_to: ["pm-1", "pm-2"],
      is_shared: true,
    };
    const { payload, dropped } = buildCopyPlan("puzzle_rooms", row, TARGET_CAMPAIGN, USER_ID, new Map());
    expect(payload.player_visible_to).toEqual([]);
    expect(payload.is_shared).toBe(false);
    expect(dropped).toEqual([]);
  });
});

describe("buildCopyPlan — loot_tables", () => {
  const LOOKUPS = refMap([
    { id: "mon-1", name: "Owlbear", campaignId: TARGET_CAMPAIGN },
    { id: "item-1", name: "Vial of Acid", campaignId: OTHER_CAMPAIGN },
    { id: "item-2", name: "Potion of Healing", campaignId: TARGET_CAMPAIGN },
  ]);

  it("filters monster_ids per the visibility rule", () => {
    const row = { id: "lt1", monster_ids: ["mon-1"], entries: [] };
    const { payload, dropped } = buildCopyPlan("loot_tables", row, TARGET_CAMPAIGN, USER_ID, LOOKUPS);
    expect(payload.monster_ids).toEqual(["mon-1"]);
    expect(dropped).toEqual([]);
  });

  it("removes a dangling item entry outright, rather than blanking item_id (removedEntries: true)", () => {
    const row = {
      id: "lt1",
      monster_ids: [],
      entries: [
        { id: "e1", type: "item", item_id: "item-1", drop_chance: 50 }, // other campaign
        { id: "e2", type: "item", item_id: "item-2", drop_chance: 100 }, // visible
        { id: "e3", type: "currency", pp: 10, drop_chance: 100 }, // no item_id at all
      ],
    };
    const { payload, dropped } = buildCopyPlan("loot_tables", row, TARGET_CAMPAIGN, USER_ID, LOOKUPS);
    const entries = payload.entries as Array<{ id: string }>;
    expect(entries.map((e) => e.id)).toEqual(["e2", "e3"]);
    expect(dropped).toEqual([
      {
        label: "Loot entries",
        names: ["Vial of Acid"],
        removedEntries: true,
        entryNoun: { singular: "loot entry", plural: "loot entries" },
      },
    ]);
  });

  it("an entry with type absent defaults to 'item' (matches validateEntries' own default)", () => {
    const row = { id: "lt1", monster_ids: [], entries: [{ id: "e1", item_id: "item-1", drop_chance: 50 }] };
    const { payload, dropped } = buildCopyPlan("loot_tables", row, TARGET_CAMPAIGN, USER_ID, LOOKUPS);
    expect(payload.entries).toEqual([]);
    expect(dropped).toEqual([
      {
        label: "Loot entries",
        names: ["Vial of Acid"],
        removedEntries: true,
        entryNoun: { singular: "loot entry", plural: "loot entries" },
      },
    ]);
  });
});

describe("buildCopyPlan — roll_tables", () => {
  const LOOKUPS = refMap([{ id: "enc-1", name: "Ambush!", campaignId: OTHER_CAMPAIGN }]);

  it("clears encounter_id but keeps the entry — its label reads on its own", () => {
    const row = {
      id: "rt1",
      entries: [{ id: "e1", min: 1, max: 4, label: "Wolves howl in the distance", encounter_id: "enc-1" }],
    };
    const { payload, dropped } = buildCopyPlan("roll_tables", row, TARGET_CAMPAIGN, USER_ID, LOOKUPS);
    const entries = payload.entries as Array<{ label: string; encounter_id: string | null }>;
    expect(entries).toHaveLength(1);
    expect(entries[0].encounter_id).toBeNull();
    expect(entries[0].label).toBe("Wolves howl in the distance");
    expect(dropped).toEqual([
      {
        label: "Linked encounters",
        names: ["Ambush!"],
        removedEntries: false,
        entryNoun: { singular: "linked encounter", plural: "linked encounters" },
      },
    ]);
  });

  it("an entry with no encounter passes through untouched", () => {
    const row = { id: "rt1", entries: [{ id: "e1", min: 1, max: 4, label: "Nothing happens" }] };
    const { payload, dropped } = buildCopyPlan("roll_tables", row, TARGET_CAMPAIGN, USER_ID, LOOKUPS);
    expect(payload.entries).toEqual(row.entries);
    expect(dropped).toEqual([]);
  });
});

describe("buildCopyPlan — spells and traps have no cross-entity references", () => {
  it.each(["spells", "traps"] as BulkScopeTable[])("%s never produces a drop report", (table) => {
    const row = { id: "x1", name: "Whatever", tags: ["a", "b"] };
    const { dropped } = buildCopyPlan(table, row, TARGET_CAMPAIGN, USER_ID, new Map());
    expect(dropped).toEqual([]);
  });
});

describe("referencedIds", () => {
  it("items: spell_ids", () => {
    expect(referencedIds("items", { spell_ids: [SPELL_VISIBLE, SPELL_GENERAL] })).toEqual({
      spells: [SPELL_VISIBLE, SPELL_GENERAL],
    });
    expect(referencedIds("items", { spell_ids: [] })).toEqual({});
  });

  it("monsters: lair_location_id", () => {
    expect(referencedIds("monsters", { lair_location_id: "loc-1" })).toEqual({ locations: ["loc-1"] });
    expect(referencedIds("monsters", { lair_location_id: null })).toEqual({});
  });

  it("species: granted_spells excludes slugs, includes uuids from both object and bare-string elements", () => {
    const row = {
      granted_spells: [
        { spell_id: SPELL_VISIBLE },
        { spell_id: LIBRARY_SLUG },
        { spell_id: null },
        SPELL_OTHER_CAMPAIGN,
        LIBRARY_SLUG,
      ],
    };
    expect(referencedIds("species", row)).toEqual({ spells: [SPELL_VISIBLE, SPELL_OTHER_CAMPAIGN] });
  });

  it("puzzle_rooms: location_id + dungeon_feature_id, never player_visible_to", () => {
    expect(
      referencedIds("puzzle_rooms", {
        location_id: "loc-1",
        dungeon_feature_id: "feat-1",
        player_visible_to: ["pm-1", "pm-2"],
      }),
    ).toEqual({ locations: ["loc-1"], dungeon_features: ["feat-1"] });
    expect(referencedIds("puzzle_rooms", { location_id: null, dungeon_feature_id: null })).toEqual({});
  });

  it("loot_tables: monster_ids + item entries only", () => {
    const row = {
      monster_ids: ["mon-1"],
      entries: [
        { type: "item", item_id: "item-1" },
        { type: "currency", pp: 5 }, // no item_id contributed
        { item_id: "item-2" }, // type absent -> defaults to "item"
      ],
    };
    expect(referencedIds("loot_tables", row)).toEqual({ monsters: ["mon-1"], items: ["item-1", "item-2"] });
  });

  it("roll_tables: entries' encounter_id only", () => {
    const row = { entries: [{ encounter_id: "enc-1" }, { label: "nothing" }] };
    expect(referencedIds("roll_tables", row)).toEqual({ encounters: ["enc-1"] });
  });

  it("spells and traps: always empty", () => {
    expect(referencedIds("spells", { name: "Fireball" })).toEqual({});
    expect(referencedIds("traps", { name: "Pit trap" })).toEqual({});
  });
});

// A library row belongs to no campaign, so it can never dangle — but a campaign
// only *sees* a source it has enabled, so a copy can carry a grant the target
// cannot resolve. That is reported, never dropped: the fix is one toggle in the
// target campaign, and silently losing the grant would be the worse outcome.
describe("libraryReferencedIds", () => {
  it("names a species' library-slug grants, and never its uuid ones", () => {
    const row = {
      granted_spells: [
        { spell_id: LIBRARY_SLUG, spell_name: "Fireball" },
        { spell_id: SPELL_VISIBLE, spell_name: "Chill Touch" },
        { spell_id: null, spell_name: "Any cantrip" },
      ],
    };
    expect(libraryReferencedIds("species", row)).toEqual({ library_spells: [LIBRARY_SLUG] });
    // The uuid grant is `referencedIds`' business, not this one's — the two
    // lists are disjoint by construction.
    expect(referencedIds("species", row)).toEqual({ spells: [SPELL_VISIBLE] });
  });

  it("finds nothing for a species with no library grants", () => {
    expect(libraryReferencedIds("species", { granted_spells: [{ spell_id: SPELL_VISIBLE }] })).toEqual({});
    expect(libraryReferencedIds("species", {})).toEqual({});
  });

  it("finds nothing on the other seven tables — only granted_spells can hold a slug", () => {
    // items.spell_ids and loot_tables.monster_ids are uuid[] columns and cannot
    // hold a text slug at all, so there is no library reference to look for.
    const tables: BulkScopeTable[] = ["items", "spells", "monsters", "traps", "puzzle_rooms", "loot_tables", "roll_tables"];
    for (const table of tables) {
      expect(libraryReferencedIds(table, { spell_ids: [LIBRARY_SLUG], monster_ids: [LIBRARY_SLUG] })).toEqual({});
    }
  });

  it("still carries a library grant through the copy untouched", () => {
    const row = { id: "sp1", granted_spells: [{ spell_id: LIBRARY_SLUG, spell_name: "Fireball" }] };
    const { payload, dropped } = buildCopyPlan("species", row, TARGET_CAMPAIGN, USER_ID, new Map());
    expect((payload.granted_spells as Array<{ spell_id: string }>)[0].spell_id).toBe(LIBRARY_SLUG);
    expect(dropped).toEqual([]);
  });
});

// #598 F12: `referencedIds` and `buildCopyPlan` each hold a `switch (table)`
// with no runtime default (they do different jobs, so they are deliberately
// NOT collapsed into one config table — see the module's own comments). A
// table silently falling through to the switch's absence-of-a-case case
// wouldn't throw, so a behavioural test can't distinguish "handled" from
// "fell through and happened to look empty". A structural check on the
// source text can: this asserts every table in `BulkScopeTable` has its own
// explicit `case` in both switches, so a ninth table added to the union
// without a matching case in either function fails here rather than shipping
// with silently-unhandled cross-entity references.
describe("referencedIds and buildCopyPlan switches stay exhaustive over BulkScopeTable", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/campaign/copyToCampaign.ts"), "utf-8");

  function functionBody(fnName: string): string {
    const start = source.indexOf(`export function ${fnName}(`);
    if (start === -1) throw new Error(`${fnName} not found in copyToCampaign.ts — did it get renamed?`);
    const nextExport = source.indexOf("\nexport function ", start + 1);
    return source.slice(start, nextExport === -1 ? source.length : nextExport);
  }

  const referencedIdsBody = functionBody("referencedIds");
  const buildCopyPlanBody = functionBody("buildCopyPlan");
  const tables = Object.keys(BULK_SCOPE_QUERY_KEY) as BulkScopeTable[];

  it.each(tables)("referencedIds has an explicit case for %s, not the fallthrough path", (table) => {
    expect(referencedIdsBody).toContain(`case "${table}"`);
  });

  it.each(tables)("buildCopyPlan has an explicit case for %s, not the fallthrough path", (table) => {
    expect(buildCopyPlanBody).toContain(`case "${table}"`);
  });
});
