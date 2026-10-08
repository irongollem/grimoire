import { describe, expect, it } from "vitest";
import spellIds from "../../scripts/data/library-spell-ids.json";
import { LIBRARY_SUBCLASS_SPELLS } from "@/data/librarySubclassSpells";
import type { LibrarySubclassSpells } from "@/data/librarySubclassSpells";
import identities from "../../scripts/data/library-subclass-identities.json";

const idsFor = { "2014": new Set(spellIds["2014"]), "2024": new Set(spellIds["2024"]) };

function find(documentKey: string, recordKey: string, ruleset: "2014" | "2024"): LibrarySubclassSpells {
  const hit = LIBRARY_SUBCLASS_SPELLS.find(
    e => e.source_document_key === documentKey && e.source_record_key === recordKey && e.ruleset === ruleset,
  );
  if (!hit) throw new Error(`no entry for ${documentKey}::${recordKey}::${ruleset}`);
  return hit;
}

function allIds(e: LibrarySubclassSpells): string[] {
  return [
    ...Object.values(e.granted_spells).flat(),
    ...Object.values(e.spell_variants).flatMap(v => Object.values(v).flat()),
    ...Object.values(e.expanded_spells).flat(),
    ...Object.values(e.expanded_spell_variants).flatMap(v => Object.values(v).flat()),
  ];
}

describe("librarySubclassSpells", () => {
  it("names a library subclass by an identity that exists, once", () => {
    const known = new Set(identities.map(i => `${i.source_document_key}::${i.source_record_key}::${i.ruleset}`));
    const seen = new Set<string>();
    for (const e of LIBRARY_SUBCLASS_SPELLS) {
      const key = `${e.source_document_key}::${e.source_record_key}::${e.ruleset}`;
      expect(known.has(key), key).toBe(true);
      expect(seen.has(key), `${key} twice`).toBe(false);
      seen.add(key);
    }
  });

  it("only references spells that exist in the entry's own ruleset library", () => {
    for (const e of LIBRARY_SUBCLASS_SPELLS) {
      for (const id of allIds(e)) {
        expect(idsFor[e.ruleset].has(id), `${e.source_record_key}: ${id}`).toBe(true);
      }
    }
  });

  it("lists a spell once per level and never an empty level", () => {
    for (const e of LIBRARY_SUBCLASS_SPELLS) {
      const maps = [e.granted_spells, e.expanded_spells, ...Object.values(e.spell_variants), ...Object.values(e.expanded_spell_variants)];
      for (const map of maps) {
        for (const [level, ids] of Object.entries(map)) {
          expect(ids.length, `${e.source_record_key} ${level}`).toBeGreaterThan(0);
          expect(new Set(ids).size, `${e.source_record_key} ${level}`).toBe(ids.length);
        }
      }
    }
  });

  it("gives a 2014 Warlock patron an expanded list and nothing always prepared", () => {
    const warlocks = LIBRARY_SUBCLASS_SPELLS.filter(e => {
      const row = identities.find(
        i => i.source_document_key === e.source_document_key && i.source_record_key === e.source_record_key && i.ruleset === e.ruleset,
      );
      return row?.class_name === "Warlock" && e.ruleset === "2014";
    });
    expect(warlocks.length).toBeGreaterThan(0);
    for (const e of warlocks) {
      expect(e.granted_spells, e.source_record_key).toEqual({});
      expect(Object.keys(e.expanded_spells).length, e.source_record_key).toBeGreaterThan(0);
      for (const level of Object.keys(e.expanded_spells)) expect(["1", "2", "3", "4", "5"]).toContain(level);
    }
  });

  it("labels every subclass that has variants", () => {
    for (const e of LIBRARY_SUBCLASS_SPELLS) {
      if (Object.keys(e.spell_variants).length > 0 || Object.keys(e.expanded_spell_variants).length > 0) {
        expect(e.spell_variant_label, e.source_record_key).toBeTruthy();
      } else {
        expect(e.spell_variant_label, e.source_record_key).toBeNull();
      }
    }
  });

  it("gives Animal Lords three affinities, an Affinity label and a base list", () => {
    const lords = find("toh", "toh_animal-lords", "2014");
    expect(lords.spell_variant_label).toBe("Affinity");
    expect(Object.keys(lords.expanded_spell_variants).sort()).toEqual(["Air", "Earth", "Water"]);
    expect(lords.granted_spells).toEqual({});
    expect(Object.keys(lords.expanded_spells)).toEqual(["1", "2", "3", "4", "5"]);
    expect(Object.keys(lords.expanded_spell_variants.Earth)).toEqual(["1", "2", "4", "5"]);
  });

  describe("the SRD subclasses equal what the official PDFs print", () => {
    it("Life Domain, 2014 (SRD 5.1 p17)", () => {
      expect(find("srd-2014", "srd_life-domain", "2014").granted_spells).toEqual({
        "1": ["srd_srd_bless", "srd_srd_cure_wounds"],
        "3": ["srd_srd_lesser_restoration", "srd_spiritual_weapon"],
        "5": ["srd_beacon_of_hope", "srd_srd_revivify"],
        "7": ["srd_srd_death_ward", "srd_guardian_of_faith"],
        "9": ["srd_mass_cure_wounds", "srd_srd_raise_dead"],
      });
    });

    it("Life Domain, 2024", () => {
      expect(find("srd-2024", "srd-2024_life-domain", "2024").granted_spells).toEqual({
        "3": ["srd_srd_2024_aid", "srd_srd_2024_bless", "srd_srd_2024_cure_wounds", "srd_srd_2024_lesser_restoration"],
        "5": ["srd_srd_2024_mass_healing_word", "srd_srd_2024_revivify"],
        "7": ["srd_srd_2024_aura_of_life", "srd_srd_2024_death_ward"],
        "9": ["srd_srd_2024_greater_restoration", "srd_srd_2024_mass_cure_wounds"],
      });
    });

    it("Circle of the Land 2014: seven terrains, Coast as printed", () => {
      const land = find("srd-2014", "srd_circle-of-the-land", "2014");
      expect(land.spell_variant_label).toBe("Terrain");
      expect(land.granted_spells).toEqual({});
      expect(Object.keys(land.spell_variants).sort()).toEqual(
        ["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp"],
      );
      expect(land.spell_variants.Coast).toEqual({
        "3": ["srd_mirror_image", "srd_misty_step"],
        "5": ["srd_water_breathing", "srd_water_walk"],
        "7": ["srd_control_water", "srd_freedom_of_movement"],
        "9": ["srd_conjure_elemental", "srd_scrying"],
      });
    });

    it("Circle of the Land 2024: four land types", () => {
      const land = find("srd-2024", "srd-2024_circle-of-the-land", "2024");
      expect(land.spell_variant_label).toBe("Land type");
      expect(Object.keys(land.spell_variants).sort()).toEqual(["Arid", "Polar", "Temperate", "Tropical"]);
    });

    it("The Fiend 2014 is an expanded list by spell level; Fiend Patron 2024 is granted by warlock level", () => {
      const fiend = find("srd-2014", "srd_the-fiend", "2014");
      expect(fiend.granted_spells).toEqual({});
      expect(fiend.expanded_spells).toEqual({
        "1": ["srd_burning_hands", "srd_srd_command"],
        "2": ["srd_blindnessdeafness", "srd_scorching_ray"],
        "3": ["srd_fireball", "srd_stinking_cloud"],
        "4": ["srd_fire_shield", "srd_wall_of_fire"],
        "5": ["srd_flame_strike", "srd_hallow"],
      });
      const patron = find("srd-2024", "srd-2024_fiend-patron", "2024");
      expect(patron.expanded_spells).toEqual({});
      expect(patron.granted_spells).toEqual({
        "3": ["srd_srd_2024_burning_hands", "srd_srd_2024_command", "srd_srd_2024_scorching_ray", "srd_srd_2024_suggestion"],
        "5": ["srd_srd_2024_fireball", "srd_srd_2024_stinking_cloud"],
        "7": ["srd_srd_2024_fire_shield", "srd_srd_2024_wall_of_fire"],
        "9": ["srd_srd_2024_geas", "srd_srd_2024_insect_plague"],
      });
    });
  });
});
