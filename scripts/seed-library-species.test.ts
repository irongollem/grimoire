import { describe, expect, it } from "vitest";
import { buildSeededSpeciesRow, splitForReseed } from "./seed-library-species";

function seeded(key: string) {
  const row = buildSeededSpeciesRow({
    key,
    name: "Erina",
    desc: "Hedgehog folk.",
    is_subspecies: false,
    subspecies_of: null,
    traits: [{ name: "Speed", desc: "Your base walking speed is 25 feet.", type: null }],
    document: {
      key: "toh",
      name: "Tome of Heroes",
      display_name: "Tome of Heroes",
      gamesystem: { name: "5th Edition 2014", key: "5e-2014" },
    },
  });
  if (!row) throw new Error("fixture did not map");
  return row;
}

describe("splitForReseed", () => {
  it("writes a new species whole", () => {
    const { fresh, refresh } = splitForReseed([seeded("toh_erina")], []);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toHaveProperty("image_url", null);
    expect(refresh).toEqual([]);
  });

  it("refreshes an existing species without resetting its art, focal point or heights", () => {
    const { fresh, refresh } = splitForReseed(
      [seeded("toh_erina")],
      [{ source_document_key: "toh", source_record_key: "toh_erina" }],
    );
    expect(fresh).toEqual([]);
    expect(refresh).toHaveLength(1);
    for (const column of ["image_url", "focal_point", "avg_height", "avg_weight", "granted_spells", "is_shapeshifter"]) {
      expect(refresh[0]).not.toHaveProperty(column);
    }
    expect(refresh[0]).toMatchObject({ speed: { walk: 25 }, subraces: null });
  });
});
