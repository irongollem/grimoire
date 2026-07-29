import { describe, expect, it } from "vitest";
import type { Open5eDocumentRef } from "@/lib/open5eApi";
import { buildContentSourcePlan, deriveMachineFields, ourKeyFor, type ContentSourceRow } from "./seed-content-sources";

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
  key: "blackflag",
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

describe("ourKeyFor", () => {
  it("maps a known legacy alias back to OUR key", () => {
    expect(ourKeyFor("bfrd")).toBe("blackflag");
    expect(ourKeyFor("ccdx")).toBe("cc");
  });

  it("is the identity for a key with no legacy alias", () => {
    expect(ourKeyFor("srd-2014")).toBe("srd-2014");
    expect(ourKeyFor("tob3")).toBe("tob3");
  });
});

describe("deriveMachineFields", () => {
  it("derives every machine field, aliasing the key back to ours and setting open5e_key only when it differs", () => {
    expect(deriveMachineFields(bfrdDocument)).toEqual({
      key: "blackflag",
      open5e_key: "bfrd",
      title: "Black Flag SRD",
      publisher: "Kobold Press",
      license_keys: ["cc-by-40"],
      product_url: "https://koboldpress.com/black-flag",
      gamesystem: "5e-2014",
      is_redistributable: true,
    });
  });

  it("leaves open5e_key null when our key already matches upstream", () => {
    expect(deriveMachineFields(srd2014Document)?.open5e_key).toBeNull();
  });

  it("returns null when the document has no publisher name — cannot populate the NOT NULL column", () => {
    expect(deriveMachineFields({ key: "no-publisher-doc", name: "No Publisher" })).toBeNull();
  });
});

describe("buildContentSourcePlan — curated vs. non-curated merge", () => {
  it("leaves a curated row out of the write plan entirely, even though its Open5e document is present and disagrees", () => {
    const { plan, skippedCurated } = buildContentSourcePlan([bfrdDocument], [curatedBlackFlagRow]);

    expect(plan).toHaveLength(0);
    expect(skippedCurated).toEqual(["blackflag"]);
  });

  it("refreshes a non-curated row's machine fields from the current Open5e document", () => {
    const { plan, skippedCurated } = buildContentSourcePlan([srd2014Document], [nonCuratedSrdRow]);

    expect(skippedCurated).toEqual([]);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.fields).toEqual({
      key: "srd-2014",
      open5e_key: null,
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
