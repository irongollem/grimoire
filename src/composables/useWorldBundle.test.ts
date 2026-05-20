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
      species: [{ id: "sp-1" }],
      spells: [{ id: "spell-1" }],
    });

    const map = buildIdMap(bundle);

    for (const oldId of ["pm-1", "pm-2", "cc-1", "cs-1", "sp-1", "spell-1"]) {
      const fresh = map.get(oldId);
      expect(fresh).toBeDefined();
      expect(fresh).not.toBe(oldId);
      expect(fresh).toMatch(UUID_RE);
    }
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
    const dbCustomSpell = { id: "spell-1", user_id: "dm-source", campaign_id: "camp-source", name: "Vex's Bolt" };
    const dbCharSpells = [
      // Custom spell — UUID-keyed, travels in the bundle and must be remapped.
      { id: "cs-1", party_member_id: "pm-1", spell_id: "spell-1", source_class_id: "cc-1", is_prepared: true, source_type: "class" },
      // SRD spell — global slug, must be preserved verbatim (no remap).
      { id: "cs-2", party_member_id: "pm-1", spell_id: "srd_fireball", source_class_id: "cc-1", is_prepared: false, source_type: "class" },
    ];

    // ── Export: strip into a bundle ─────────────────────────────────────────
    const bundle = emptyBundle({
      party_members: [stripPartyMemberRow(dbMember)],
      character_classes: dbClasses,
      character_spells: dbCharSpells,
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
    const charSpells = bundle.character_spells!.map((c) => remapCharacterSpellForImport(c, ctx));

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

    // Spells: custom remapped, SRD preserved, class link + prepared-state kept.
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
