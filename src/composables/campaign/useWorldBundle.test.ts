import { describe, expect, it, vi } from "vitest";

// useWorldBundle.ts imports @/lib/supabase, which throws at module load when
// env vars are absent (CI, plain test runs). The functions under test here are
// pure row transforms — stub the supabase module so the import resolves.
vi.mock("@/lib/supabase", () => ({
  supabase: {},
  getCurrentUser: () => null,
}));

import {
  buildIdMap,
  remapCharacterClassForImport,
  remapCharacterSpellForImport,
  remapCustomClassForImport,
  remapCustomSubclassForImport,
  remapPartyMemberForImport,
  remapSpeciesForImport,
  remapSpellForImport,
  stripPartyMemberRow,
  type GrimoireBundle,
  type ImportRemapCtx,
} from "./useWorldBundle";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function emptyBundle(over: Partial<GrimoireBundle> = {}): GrimoireBundle {
  return {
    version: "1",
    file_type: "world_bundle",
    name: "Test Bundle",
    description: "",
    exported_at: "2026-05-20T00:00:00.000Z",
    _meta: { entity_counts: {}, app_version: "1.0.0" },
    ...over,
  };
}

describe("stripPartyMemberRow", () => {
  it("drops ownership + audit columns, keeps character data", () => {
    const stripped = stripPartyMemberRow({
      id: "pm-1",
      user_id: "user-old",
      campaign_id: "camp-old",
      owner_user_id: "player-old",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
      name: "Brannor",
      level: 5,
      species_id: "sp-1",
      max_hp: 42,
    });

    // Ownership + audit columns are reassigned fresh on import — dropped here.
    expect(stripped.user_id).toBeUndefined();
    expect(stripped.campaign_id).toBeUndefined();
    expect(stripped.owner_user_id).toBeUndefined();
    expect(stripped.created_at).toBeUndefined();
    expect(stripped.updated_at).toBeUndefined();

    // Character data survives the round-trip.
    expect(stripped.id).toBe("pm-1");
    expect(stripped.name).toBe("Brannor");
    expect(stripped.level).toBe(5);
    expect(stripped.species_id).toBe("sp-1");
    expect(stripped.max_hp).toBe(42);
  });
});

describe("buildIdMap", () => {
  it("assigns a fresh UUID for every character-related row", () => {
    const bundle = emptyBundle({
      party_members: [{ id: "pm-1" }, { id: "pm-2" }],
      character_classes: [{ id: "cc-1" }],
      character_spells: [{ id: "cs-1" }],
      custom_classes: [{ id: "cclass-1" }],
      custom_subclasses: [{ id: "csub-1" }],
      species: [{ id: "sp-1" }],
      spells: [{ id: "spell-1" }],
    });

    const map = buildIdMap(bundle);

    for (const oldId of ["pm-1", "pm-2", "cc-1", "cs-1", "cclass-1", "csub-1", "sp-1", "spell-1"]) {
      const fresh = map.get(oldId);
      expect(fresh).toBeDefined();
      expect(fresh).not.toBe(oldId);
      expect(fresh).toMatch(UUID_RE);
    }
  });
});

describe("remapCustomClassForImport", () => {
  it("assigns fresh id, campaign_id and user_id; preserves class data", () => {
    const idMap = new Map([["cclass-1", "cclass-fresh"]]);
    const ctx: ImportRemapCtx = { idMap, campaignId: "camp-new", userId: "dm-importer" };

    const result = remapCustomClassForImport(
      {
        id: "cclass-1",
        class_name: "School of Memory",
        hit_die: 6,
        features: {},
        source: null,
      },
      ctx,
    );

    expect(result.id).toBe("cclass-fresh");
    expect(result.campaign_id).toBe("camp-new");
    expect(result.user_id).toBe("dm-importer");
    expect(result.class_name).toBe("School of Memory");
    expect(result.hit_die).toBe(6);
    expect(result.source).toBeNull();
  });
});

describe("remapCustomSubclassForImport", () => {
  it("assigns fresh id, campaign_id and user_id; preserves name data (no class_id FK)", () => {
    const idMap = new Map([["csub-1", "csub-fresh"]]);
    const ctx: ImportRemapCtx = { idMap, campaignId: "camp-new", userId: "dm-importer" };

    const result = remapCustomSubclassForImport(
      {
        id: "csub-1",
        class_name: "Wizard",
        subclass_name: "School of Memory",
        features: {},
      },
      ctx,
    );

    expect(result.id).toBe("csub-fresh");
    expect(result.campaign_id).toBe("camp-new");
    expect(result.user_id).toBe("dm-importer");
    // Text names travel as-is — no UUID FK to remap
    expect(result.class_name).toBe("Wizard");
    expect(result.subclass_name).toBe("School of Memory");
  });
});

describe("remapCharacterClassForImport", () => {
  const idMap = new Map([["cc-1", "cc-fresh"], ["pm-1", "pm-fresh"]]);
  const baseCtx: ImportRemapCtx = { idMap, campaignId: "camp-new", userId: "dm-importer" };
  const systemPinnedRow = {
    id: "cc-1",
    party_member_id: "pm-1",
    class_name: "Wizard",
    class_definition_id: "sys-def-1",
    class_definition_kind: "system",
    subclass_definition_id: null,
    levels: 5,
  };

  it("preserves a system class_definition_id pin when the ruleset matches (no stripping requested)", () => {
    const result = remapCharacterClassForImport(systemPinnedRow, baseCtx);
    expect(result.class_definition_id).toBe("sys-def-1");
    expect(result.class_definition_kind).toBe("system");
  });

  it("remaps a custom class_definition_id through the idMap when not stripping", () => {
    const customIdMap = new Map([...idMap, ["custom-def-1", "custom-def-fresh"]]);
    const result = remapCharacterClassForImport(
      { ...systemPinnedRow, class_definition_id: "custom-def-1", class_definition_kind: "custom" },
      { ...baseCtx, idMap: customIdMap },
    );
    expect(result.class_definition_id).toBe("custom-def-fresh");
    expect(result.class_definition_kind).toBe("custom");
  });

  it("strips both class_definition_id and class_definition_kind to null when the ruleset is unknown or mismatched", () => {
    // Old (version 1) bundles or a cross-ruleset import set stripClassDefinitionPins —
    // a pin from the wrong edition would otherwise trip the content-identity trigger.
    const result = remapCharacterClassForImport(systemPinnedRow, { ...baseCtx, stripClassDefinitionPins: true });
    expect(result.class_definition_id).toBeNull();
    expect(result.class_definition_kind).toBeNull();
    // Non-pin data (name-based resolution fallback) survives.
    expect(result.class_name).toBe("Wizard");
    expect(result.levels).toBe(5);
  });
});

describe("character round-trip (export → import)", () => {
  it("lands unassigned, keeps class/level/spells, remaps FKs", () => {
    // ── A character as it lives in the source DB ────────────────────────────
    const dbMember = {
      id: "pm-1",
      user_id: "dm-source",
      campaign_id: "camp-source",
      owner_user_id: "dm-source",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
      name: "Brannor Vex",
      level: 7,
      species_id: "sp-1",
      disguise_species_id: "sp-2",
      current_location_id: "loc-not-bundled",
      max_hp: 58,
    };
    const dbSpeciesTrue = { id: "sp-1", user_id: "dm-source", campaign_id: "camp-source", name: "Tiefling" };
    const dbSpeciesDisg = { id: "sp-2", user_id: "dm-source", campaign_id: null, name: "Human" };
    const dbClasses = [
      { id: "cc-1", party_member_id: "pm-1", class_name: "Wizard", subclass_name: "Evocation", levels: 5, is_primary: true },
      { id: "cc-2", party_member_id: "pm-1", class_name: "Fighter", subclass_name: null, levels: 2, is_primary: false },
    ];
    const dbCustomClass = { id: "cclass-1", class_name: "Wizard", hit_die: 6, features: {} };
    const dbCustomSubclass = { id: "csub-1", class_name: "Wizard", subclass_name: "Evocation", features: {} };
    const dbCustomSpell = { id: "spell-1", user_id: "dm-source", campaign_id: "camp-source", name: "Vex's Bolt" };
    const dbCharSpells = [
      // Custom spell — UUID-keyed, travels in the bundle and must be remapped.
      { id: "cs-1", party_member_id: "pm-1", spell_id: "spell-1", source_class_id: "cc-1", is_prepared: true, source_type: "class" },
      // SRD spell — global slug, must be preserved verbatim (no remap).
      { id: "cs-2", party_member_id: "pm-1", spell_id: "srd_fireball", source_class_id: "cc-1", is_prepared: false, source_type: "class" },
      // Orphaned spell — references a spell not in the bundle (not srd_ and not in idMap).
      // This row must be dropped during import.
      { id: "cs-3", party_member_id: "pm-1", spell_id: "spell-orphaned", source_class_id: "cc-1", is_prepared: false, source_type: "class" },
    ];

    // ── Export: strip into a bundle ─────────────────────────────────────────
    const bundle = emptyBundle({
      party_members: [stripPartyMemberRow(dbMember)],
      character_classes: dbClasses,
      character_spells: dbCharSpells,
      custom_classes: [dbCustomClass],
      custom_subclasses: [dbCustomSubclass],
      species: [dbSpeciesTrue, dbSpeciesDisg],
      spells: [dbCustomSpell],
    });

    // ── Import: remap into a fresh campaign owned by a different DM ──────────
    const idMap = buildIdMap(bundle);
    const ctx: ImportRemapCtx = { idMap, campaignId: "camp-new", userId: "dm-importer" };

    const species = bundle.species!.map((s) => remapSpeciesForImport(s, ctx));
    const spells = bundle.spells!.map((s) => remapSpellForImport(s, ctx));
    const member = remapPartyMemberForImport(bundle.party_members![0], ctx);
    const classes = bundle.character_classes!.map((c) => remapCharacterClassForImport(c, ctx));
    const customClasses = bundle.custom_classes!.map((c) => remapCustomClassForImport(c, ctx));
    const customSubs = bundle.custom_subclasses!.map((c) => remapCustomSubclassForImport(c, ctx));

    // Simulate executeImport's table-resolved filter: shared IDs come from the
    // shared table lookup; bundled custom IDs come from idMap.
    const sharedSpellIds = new Set(["srd_fireball"]);
    const charSpells = bundle.character_spells!
      .filter((cs) => {
        const sid = cs.spell_id as string | null;
        if (!sid) return false;
        return sharedSpellIds.has(sid) || idMap.has(sid); // bundled custom spell
      })
      .map((cs) => remapCharacterSpellForImport(cs, ctx));

    // Lands unassigned (DM character), in the new campaign, owned by importer.
    expect(member.owner_user_id).toBeNull();
    expect(member.campaign_id).toBe("camp-new");
    expect(member.user_id).toBe("dm-importer");
    expect(member.id).toBe(idMap.get("pm-1"));
    expect(member.name).toBe("Brannor Vex");
    expect(member.level).toBe(7);
    expect(member.max_hp).toBe(58);

    // species_id + disguise_species_id remap to the imported species rows.
    expect(member.species_id).toBe(idMap.get("sp-1"));
    expect(member.disguise_species_id).toBe(idMap.get("sp-2"));
    expect(species[0].id).toBe(idMap.get("sp-1"));
    expect(species.every((s) => s.campaign_id === "camp-new" && s.user_id === "dm-importer")).toBe(true);

    // A location that didn't travel resolves to null, not a dangling FK.
    expect(member.current_location_id).toBeNull();

    // Classes keep their data and repoint at the new character.
    expect(classes.map((c) => c.party_member_id)).toEqual([idMap.get("pm-1"), idMap.get("pm-1")]);
    expect(classes.map((c) => c.class_name)).toEqual(["Wizard", "Fighter"]);
    expect(classes.map((c) => c.levels)).toEqual([5, 2]);

    // Custom class definitions travel with fresh ids + ownership.
    expect(customClasses[0].id).toBe(idMap.get("cclass-1"));
    expect(customClasses[0].campaign_id).toBe("camp-new");
    expect(customClasses[0].user_id).toBe("dm-importer");
    expect(customClasses[0].class_name).toBe("Wizard");

    // Custom subclasses keep their text names (no UUID FK to remap).
    expect(customSubs[0].id).toBe(idMap.get("csub-1"));
    expect(customSubs[0].campaign_id).toBe("camp-new");
    expect(customSubs[0].user_id).toBe("dm-importer");
    expect(customSubs[0].class_name).toBe("Wizard");
    expect(customSubs[0].subclass_name).toBe("Evocation");

    // Spells: custom remapped, SRD preserved, class link + prepared-state kept.
    // Orphaned spell (cs-3) is dropped — only 2 rows survive.
    expect(charSpells).toHaveLength(2);
    expect(charSpells.every((cs) => cs.party_member_id === idMap.get("pm-1"))).toBe(true);
    expect(charSpells.every((cs) => cs.source_class_id === idMap.get("cc-1"))).toBe(true);
    expect(charSpells[0].spell_id).toBe(idMap.get("spell-1"));
    expect(spells[0].id).toBe(idMap.get("spell-1"));
    expect(spells[0].campaign_id).toBe("camp-new");
    expect(charSpells[1].spell_id).toBe("srd_fireball");
    expect(charSpells[0].is_prepared).toBe(true);
    expect(charSpells[1].is_prepared).toBe(false);
  });
});
