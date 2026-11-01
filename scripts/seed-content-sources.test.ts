import { describe, expect, it } from "vitest";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import { buildContentSourcePlan, deriveMachineFields, type ContentSourceRow } from "./seed-content-sources";

const bfrdDocument: Open5eDocumentRef = {
  key: "bfrd",
  name: "Black Flag Reference Document",
  display_name: "Black Flag SRD",
  publisher: { name: "Kobold Press", key: "kobold-press" },
  gamesystem: { name: "5th Edition 2014", key: "5e-2014" },
  // Upstream tags this cc-by-40 — Open5e's license taxonomy has no ORC entry,
  // even though Kobold Press's own site states Black Flag is ORC-licensed.
  licenses: [{ name: "Creative Commons Attribution 4.0", key: "cc-by-40" }],
  permalink: "https://koboldpress.com/black-flag",
};

const srd2014Document: Open5eDocumentRef = {
  key: "srd-2014",
  name: "System Reference Document 5.1",
  display_name: "5e 2014 Rules",
  publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
  gamesystem: { name: "5th Edition 2014", key: "5e-2014" },
  licenses: [{ name: "Creative Commons Attribution 4.0", key: "cc-by-40" }],
  permalink: "https://dnd.wizards.com/resources/systems-reference-document",
};

/** The hand-curated Black Flag row: license_keys corrected to `orc`, flagged curated. */
const curatedBlackFlagRow: ContentSourceRow = {
  key: "bfrd",
  open5e_key: "bfrd",
  title: "Black Flag Reference Document",
  publisher: "Kobold Press",
  license_keys: ["orc"],
  copyright_notice: "Black Flag Reference Document Copyright 2023, Kobold Press.",
  product_url: "https://koboldpress.com/black-flag",
  gamesystem: "5e-2014",
  is_redistributable: true,
  is_metadata_curated: true,
  sort_order: 5,
};

/** A plain, non-curated existing row with stale-looking machine fields and real curated columns. */
const nonCuratedSrdRow: ContentSourceRow = {
  key: "srd-2014",
  open5e_key: null,
  title: "Old Title",
  publisher: "Wizards of the Coast (stale)",
  license_keys: ["ogl-10a"],
  copyright_notice: "System Reference Document Copyright 2000-2003, Wizards of the Coast, Inc.",
  product_url: null,
  gamesystem: "5e-2014",
  is_redistributable: true,
  is_metadata_curated: false,
  sort_order: 1,
};

describe("deriveMachineFields", () => {
  it("derives every machine field, with the Open5e document key as both key and open5e_key", () => {
    expect(deriveMachineFields(bfrdDocument)).toEqual({
      key: "bfrd",
      open5e_key: "bfrd",
      title: "Black Flag SRD",
      publisher: "Kobold Press",
      license_keys: ["cc-by-40"],
      product_url: "https://koboldpress.com/black-flag",
      gamesystem: "5e-2014",
      is_redistributable: true,
    });
  });

  it("sets open5e_key for a book that never had a second key too, so a re-seed does not null it", () => {
    expect(deriveMachineFields(srd2014Document)?.open5e_key).toBe("srd-2014");
  });

  it("falls back to the document's name for a title, and to null for a missing link or game system", () => {
    const plain: Open5eDocumentRef = { key: "plain", name: "Plain Book", publisher: { name: "Someone", key: "someone" }, licenses: [] };
    expect(deriveMachineFields(plain)).toMatchObject({ title: "Plain Book", product_url: null, gamesystem: null, license_keys: [], is_redistributable: false });
  });

  it("returns null for a publisher with no name, as for none at all", () => {
    expect(deriveMachineFields({ key: "x", name: "X", publisher: { name: "", key: "" } })).toBeNull();
  });

  it("returns null when the document has no publisher name — cannot populate the NOT NULL column", () => {
    expect(deriveMachineFields({ key: "no-publisher-doc", name: "No Publisher" })).toBeNull();
  });
});

describe("buildContentSourcePlan — curated vs. non-curated merge", () => {
  it("never plans a row for an A5E document, even a redistributable one (A5E is frozen, #934)", () => {
    const a5e: Open5eDocumentRef = {
      key: "a5e-ag",
      name: "Adventurer's Guide",
      publisher: { name: "EN Publishing", key: "en-publishing" },
      gamesystem: { name: "Level Up", key: "a5e" },
      licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
    };
    const { plan, skippedA5e } = buildContentSourcePlan([a5e], []);
    expect(plan).toHaveLength(0);
    expect(skippedA5e).toEqual(["a5e-ag"]);
  });

  it("leaves a curated row out of the write plan entirely, even though its Open5e document is present and disagrees", () => {
    const { plan, skippedCurated } = buildContentSourcePlan([bfrdDocument], [curatedBlackFlagRow]);

    expect(plan).toHaveLength(0);
    expect(skippedCurated).toEqual(["bfrd"]);
  });

  it("refreshes a non-curated row's machine fields from the current Open5e document", () => {
    const { plan, skippedCurated } = buildContentSourcePlan([srd2014Document], [nonCuratedSrdRow]);

    expect(skippedCurated).toEqual([]);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.fields).toEqual({
      key: "srd-2014",
      open5e_key: "srd-2014",
      title: "5e 2014 Rules",
      publisher: "Wizards of the Coast",
      license_keys: ["cc-by-40"],
      product_url: "https://dnd.wizards.com/resources/systems-reference-document",
      gamesystem: "5e-2014",
      is_redistributable: true,
    });
  });

  it("never includes copyright_notice or sort_order in the machine fields, for either a curated or non-curated row — and the existing curated values remain readable off `existing`, proving they were read, not lost", () => {
    const curatedResult = buildContentSourcePlan([bfrdDocument], [curatedBlackFlagRow]);
    expect(curatedResult.plan).toHaveLength(0);

    const { plan } = buildContentSourcePlan([srd2014Document], [nonCuratedSrdRow]);
    expect(plan[0]?.fields).not.toHaveProperty("copyright_notice");
    expect(plan[0]?.fields).not.toHaveProperty("sort_order");
    expect(plan[0]?.fields).not.toHaveProperty("is_metadata_curated");
    expect(plan[0]?.existing?.copyright_notice).toBe(
      "System Reference Document Copyright 2000-2003, Wizards of the Coast, Inc.",
    );
    expect(plan[0]?.existing?.sort_order).toBe(1);
  });

  it("never introduces a brand-new row for a document that isn't redistributable and has no existing row", () => {
    const unlicensedDocument: Open5eDocumentRef = {
      key: "unreviewed-doc",
      name: "Unreviewed Document",
      publisher: { name: "Some Publisher", key: "some-publisher" },
      licenses: [],
    };
    const { plan, skippedNotRedistributable } = buildContentSourcePlan([unlicensedDocument], []);

    expect(plan).toHaveLength(0);
    expect(skippedNotRedistributable).toEqual(["unreviewed-doc"]);
  });

  it("still updates a non-redistributable document's row when a (non-curated) catalogue row already exists — parking it rather than dropping it", () => {
    const revokedDocument: Open5eDocumentRef = {
      key: "srd-2014",
      name: "System Reference Document 5.1",
      publisher: { name: "Wizards of the Coast", key: "wizards-of-the-coast" },
      licenses: [],
    };
    const { plan, skippedNotRedistributable } = buildContentSourcePlan([revokedDocument], [nonCuratedSrdRow]);

    expect(skippedNotRedistributable).toEqual([]);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.fields.is_redistributable).toBe(false);
  });

  it("skips a document with no publisher name and reports it separately from the redistribution/curation skips", () => {
    const noPublisherDocument: Open5eDocumentRef = { key: "no-publisher-doc", name: "No Publisher" };
    const { plan, skippedNoPublisher, skippedCurated, skippedNotRedistributable } = buildContentSourcePlan(
      [noPublisherDocument],
      [],
    );

    expect(plan).toHaveLength(0);
    expect(skippedNoPublisher).toEqual(["no-publisher-doc"]);
    expect(skippedCurated).toEqual([]);
    expect(skippedNotRedistributable).toEqual([]);
  });
});
