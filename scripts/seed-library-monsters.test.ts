import { describe, expect, it } from "vitest";
import { emptyDefenses } from "@/types/statBlock.types";
import { libraryMonsterId, preserveSettledStructures, seedRow } from "./seed-library-monsters";

describe("libraryMonsterId", () => {
  it("prefixes and sanitizes a 2014-edition source_record_key", () => {
    expect(libraryMonsterId("srd_goblin")).toBe("srd_srd_goblin");
  });

  it("prefixes and sanitizes a 2024-edition source_record_key", () => {
    expect(libraryMonsterId("srd-2024_adult-red-dragon")).toBe("srd_srd_2024_adult_red_dragon");
  });

  it("stays distinct across editions for the same creature name", () => {
    const id2014 = libraryMonsterId("srd_adult-red-dragon");
    const id2024 = libraryMonsterId("srd-2024_adult-red-dragon");
    expect(id2014).not.toBe(id2024);
  });

  it("collapses runs of non-alphanumeric characters and trims leading/trailing underscores", () => {
    expect(libraryMonsterId("--Weird//Key!!")).toBe("srd_weird_key");
  });
});

describe("seedRow", () => {
  const mapped = {
    ruleset: "2014" as const,
    conceptual_key: "black_bear",
    source_document_key: "srd-2014",
    source_record_key: "srd_black-bear",
    name: "Black Bear",
    monster_type: "beast" as const,
    size: "medium" as const,
    alignment: "unaligned",
    habitat: null,
    source: "srd-2014",
    tags: [],
    stat_block: { armor_class: 11, hit_points: "19", speed: "40 ft.", str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7, challenge_rating: "1/2", defenses: emptyDefenses() },
    notes: null,
    image_url: null,
    cutout_url: null,
    is_shared: true,
    open5e_import: true,
  };

  it("leaves out every field the library owns, so a re-run cannot wipe it", () => {
    const row = seedRow(mapped, "srd_srd_black_bear");
    for (const field of ["habitat", "tags", "notes", "image_url", "cutout_url", "description"]) {
      expect(row).not.toHaveProperty(field);
    }
  });

  it("keeps what Open5e supplies and adds the stable id", () => {
    const row = seedRow(mapped, "srd_srd_black_bear");
    expect(row).toMatchObject({ id: "srd_srd_black_bear", name: "Black Bear", source_record_key: "srd_black-bear", is_shared: true });
    expect(row.stat_block.challenge_rating).toBe("1/2");
  });
});

describe("preserveSettledStructures", () => {
  const BITE = "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.";
  const base = { armor_class: 11, hit_points: "19", speed: "40 ft.", str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7, challenge_rating: "1/2", defenses: emptyDefenses() };
  const parsed = { kind: "other" as const, source: "parsed" as const };
  const fresh = { ...base, actions: [{ name: "Bite", description: BITE, structured: parsed }] };

  it("keeps a manual structure the DM set, over the parser's reading", () => {
    const manual = { kind: "other" as const, source: "manual" as const };
    const result = preserveSettledStructures(fresh, { actions: [{ name: "Bite", description: BITE, structured: manual }] });
    expect(result.actions?.[0].structured).toEqual(manual);
  });

  it("keeps an extracted structure only while the prose still backs it", () => {
    const extracted = { kind: "attack" as const, source: "extracted" as const, attack: { delivery: "melee" as const, bonus: 4, reach: 5, hit: [{ dice: "1d6+2", type: "piercing" as const }] } };
    const kept = preserveSettledStructures(fresh, { actions: [{ name: "Bite", description: BITE, structured: extracted }] });
    expect(kept.actions?.[0].structured.source).toBe("extracted");

    const lying = { ...extracted, attack: { ...extracted.attack, bonus: 9 } };
    const dropped = preserveSettledStructures(fresh, { actions: [{ name: "Bite", description: BITE, structured: lying }] });
    expect(dropped.actions?.[0].structured.source).toBe("parsed");
  });

  it("ignores a stored entry whose description changed, and a stored row of the old prose shape", () => {
    const manual = { kind: "other" as const, source: "manual" as const };
    const changed = preserveSettledStructures(fresh, { actions: [{ name: "Bite", description: "Different.", structured: manual }] });
    expect(changed.actions?.[0].structured.source).toBe("parsed");
    expect(preserveSettledStructures(fresh, { actions: [{ name: "Bite", description: BITE }] })).toBe(fresh);
    expect(preserveSettledStructures(fresh, undefined)).toBe(fresh);
  });
});
