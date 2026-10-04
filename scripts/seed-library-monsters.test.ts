import { describe, expect, it } from "vitest";
import { libraryMonsterId, seedRow } from "./seed-library-monsters";

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
    stat_block: { armor_class: 11, hit_points: "19", speed: "40 ft.", str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7, challenge_rating: "1/2" },
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
