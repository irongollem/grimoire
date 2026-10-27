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

  it("keeps an existing row whose upstream record is empty, and still inserts a new one", () => {
    const existing = [{ source_document_key: "toh", source_record_key: "toh_erina" }];
    const kept = splitForReseed([seeded("toh_erina")], existing, new Set(["toh_erina"]));
    expect(kept.refresh).toEqual([]);
    expect(kept.keptEmpty).toEqual(["toh_erina"]);
    const inserted = splitForReseed([seeded("toh_erina")], [], new Set(["toh_erina"]));
    expect(inserted.fresh).toHaveLength(1);
  });
});

describe("buildSeededSpeciesRow identity", () => {
  const race = (document: { key: string; name: string; display_name?: string; gamesystem: { name: string; key: string } }) => ({
    key: "toh_erina",
    name: "Erina",
    desc: "Hedgehog folk.",
    is_subspecies: false,
    subspecies_of: null,
    traits: [],
    document,
  });
  const toh = { key: "toh", name: "Tome of Heroes", display_name: "Tome of Heroes (2024)", gamesystem: { name: "5th Edition 2014", key: "5e-2014" } };

  it("files the row under a stable library id, the document it came from, and that book's display title", () => {
    expect(buildSeededSpeciesRow(race(toh))).toMatchObject({ id: "srd_toh_erina", source: "toh", source_title: "Tome of Heroes (2024)" });
  });

  it("falls back to the document's name when it has no display name", () => {
    const { display_name: _display, ...plain } = toh;
    expect(buildSeededSpeciesRow(race(plain))?.source_title).toBe("Tome of Heroes");
  });

  it("maps nothing for a document of a system the library does not carry", () => {
    expect(buildSeededSpeciesRow(race({ ...toh, gamesystem: { name: "Advanced 5th Edition", key: "a5e" } }))).toBeNull();
  });

  it("keeps the subraces it is given", () => {
    const row = buildSeededSpeciesRow(race(toh), undefined, [{ name: "Marsh Erina", description: "Wet.", traits: [] }]);
    expect(row?.subraces).toHaveLength(1);
  });
});

describe("splitForReseed, matching an existing row", () => {
  it("matches on document and record key together, so another book's record of the same key is new", () => {
    const { fresh, refresh } = splitForReseed([seeded("toh_erina")], [{ source_document_key: "other-book", source_record_key: "toh_erina" }]);
    expect(fresh).toHaveLength(1);
    expect(refresh).toEqual([]);
  });
});

describe("buildSeededSpeciesRow walk speed", () => {
  it("gives a species with no walking speed anywhere 30 ft", () => {
    const row = buildSeededSpeciesRow({
      key: "toh_blank",
      name: "Blank",
      desc: "",
      is_subspecies: false,
      subspecies_of: null,
      traits: [],
      document: { key: "toh", name: "Tome of Heroes", display_name: "Tome of Heroes", gamesystem: { name: "5th Edition 2014", key: "5e-2014" } },
    });
    expect(row?.speed).toEqual({ walk: 30 });
  });
});
