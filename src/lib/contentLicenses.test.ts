import { describe, it, expect } from "vitest";
import {
  licenseDescriptor,
  groupSourcesByLicense,
  oglSection15Chain,
  unlicensedSources,
} from "@/lib/contentLicenses";
import { OGL_1_0A_BASE_NOTICE } from "@/data/ogl";
import type { ContentLicenseSource } from "@/types/license.types";

// Builds a fixture row. Counts default to 0 except monster_count; entry_count
// is always derived from the six counts so a test can never silently drift
// out of sync with the "sum of six" contract.
function makeSource(overrides: Partial<ContentLicenseSource> & { key: string }): ContentLicenseSource {
  const counts = {
    monster_count: overrides.monster_count ?? 1,
    spell_count: overrides.spell_count ?? 0,
    item_count: overrides.item_count ?? 0,
    species_count: overrides.species_count ?? 0,
    rule_count: overrides.rule_count ?? 0,
    class_count: overrides.class_count ?? 0,
  };
  const entry_count = counts.monster_count + counts.spell_count + counts.item_count
    + counts.species_count + counts.rule_count + counts.class_count;

  return {
    open5e_key: null,
    title: overrides.key,
    publisher: "Test Publisher",
    license_keys: [],
    copyright_notice: null,
    product_url: null,
    gamesystem: "5e-2014",
    sort_order: 0,
    ...counts,
    entry_count,
    ...overrides,
  };
}

describe("licenseDescriptor", () => {
  it("returns the descriptor for a known key", () => {
    const d = licenseDescriptor("ogl-10a");
    expect(d).not.toBeNull();
    expect(d?.shortName).toBe("OGL 1.0a");
    expect(d?.reproducesFullText).toBe(true);
  });

  it("returns null for an unknown key", () => {
    expect(licenseDescriptor("wtfpl")).toBeNull();
  });
});

describe("groupSourcesByLicense", () => {
  it("returns [] for no sources", () => {
    expect(groupSourcesByLicense([])).toEqual([]);
  });

  it("orders groups OGL first, then CC-BY, then ORC, then CC0, then unknown", () => {
    const sources = [
      makeSource({ key: "cc0-src", title: "CC0 Src", license_keys: ["cc0"] }),
      makeSource({ key: "unknown-src", title: "Unknown Src", license_keys: ["some-future-license"] }),
      makeSource({ key: "orc-src", title: "ORC Src", license_keys: ["orc"] }),
      makeSource({ key: "ccby-src", title: "CC-BY Src", license_keys: ["cc-by-40"] }),
      makeSource({ key: "ogl-src", title: "OGL Src", license_keys: ["ogl-10a"] }),
    ];

    const groups = groupSourcesByLicense(sources);
    expect(groups.map((g) => g.license.key)).toEqual([
      "ogl-10a",
      "cc-by-40",
      "orc",
      "cc0",
      "some-future-license",
    ]);
  });

  it("groups an ORC-licensed source (e.g. Black Flag) under the ORC descriptor", () => {
    const source = makeSource({ key: "black-flag", title: "Black Flag Reference Document", license_keys: ["orc"], monster_count: 360 });
    const groups = groupSourcesByLicense([source]);

    expect(groups).toHaveLength(1);
    expect(groups[0].license.key).toBe("orc");
    expect(groups[0].license.shortName).toBe("ORC");
    expect(groups[0].license.requiredNotice).not.toBeNull();
    expect(groups[0].sources.map((s) => s.key)).toEqual(["black-flag"]);
  });

  it("puts a dual-licensed source under both of its groups", () => {
    const dual = makeSource({ key: "black-flag", title: "Black Flag SRD", license_keys: ["cc-by-40", "ogl-10a"] });
    const groups = groupSourcesByLicense([dual]);

    expect(groups).toHaveLength(2);
    const oglGroup = groups.find((g) => g.license.key === "ogl-10a");
    const ccByGroup = groups.find((g) => g.license.key === "cc-by-40");
    expect(oglGroup?.sources.map((s) => s.key)).toEqual(["black-flag"]);
    expect(ccByGroup?.sources.map((s) => s.key)).toEqual(["black-flag"]);
  });

  it("orders sources within a group by sort_order then title", () => {
    const sources = [
      makeSource({ key: "b", title: "Beta", license_keys: ["ogl-10a"], sort_order: 1 }),
      makeSource({ key: "a", title: "Alpha", license_keys: ["ogl-10a"], sort_order: 1 }),
      makeSource({ key: "z", title: "Zeta", license_keys: ["ogl-10a"], sort_order: 0 }),
    ];

    const [group] = groupSourcesByLicense(sources);
    expect(group.sources.map((s) => s.key)).toEqual(["z", "a", "b"]);
  });

  it("surfaces an unknown license key under a raw-key descriptor rather than dropping it", () => {
    const source = makeSource({ key: "mystery", title: "Mystery Source", license_keys: ["orc-1.5"] });
    const groups = groupSourcesByLicense([source]);

    expect(groups).toHaveLength(1);
    expect(groups[0].license.key).toBe("orc-1.5");
    expect(groups[0].license.name).toBe("orc-1.5");
    expect(groups[0].sources).toHaveLength(1);
  });

  it("excludes sources with no license keys from every group", () => {
    const source = makeSource({ key: "grimoire-system", title: "Grimoire System", license_keys: [] });
    expect(groupSourcesByLicense([source])).toEqual([]);
  });
});

describe("oglSection15Chain", () => {
  it("returns [] when no source carries the OGL license", () => {
    const sources = [
      makeSource({ key: "ccby-only", title: "CC-BY Only", license_keys: ["cc-by-40"], copyright_notice: "Some CC notice" }),
    ];
    expect(oglSection15Chain(sources)).toEqual([]);
  });

  it("returns just the base notice when OGL is present but no source has a notice", () => {
    const sources = [
      makeSource({ key: "no-notice", title: "No Notice", license_keys: ["ogl-10a"], copyright_notice: null }),
    ];
    expect(oglSection15Chain(sources)).toEqual([OGL_1_0A_BASE_NOTICE]);
  });

  it("prepends the base notice, then each source's notice, ordered by sort_order then title", () => {
    const sources = [
      makeSource({ key: "b", title: "Beta Codex", license_keys: ["ogl-10a"], copyright_notice: "Beta Codex Copyright 2020", sort_order: 2 }),
      makeSource({ key: "a", title: "Alpha Codex", license_keys: ["ogl-10a"], copyright_notice: "Alpha Codex Copyright 2019", sort_order: 1 }),
    ];

    expect(oglSection15Chain(sources)).toEqual([
      OGL_1_0A_BASE_NOTICE,
      "Alpha Codex Copyright 2019",
      "Beta Codex Copyright 2020",
    ]);
  });

  it("deduplicates identical copyright notices", () => {
    const sources = [
      makeSource({ key: "a", title: "Alpha", license_keys: ["ogl-10a"], copyright_notice: "Shared Notice", sort_order: 0 }),
      makeSource({ key: "b", title: "Beta", license_keys: ["ogl-10a"], copyright_notice: "Shared Notice", sort_order: 1 }),
    ];

    expect(oglSection15Chain(sources)).toEqual([OGL_1_0A_BASE_NOTICE, "Shared Notice"]);
  });

  it("ignores non-OGL sources' notices entirely", () => {
    const sources = [
      makeSource({ key: "ogl-src", title: "OGL Src", license_keys: ["ogl-10a"], copyright_notice: "OGL Notice" }),
      makeSource({ key: "ccby-src", title: "CC-BY Src", license_keys: ["cc-by-40"], copyright_notice: "CC-BY Notice" }),
    ];

    expect(oglSection15Chain(sources)).toEqual([OGL_1_0A_BASE_NOTICE, "OGL Notice"]);
  });
});

describe("unlicensedSources", () => {
  it("returns [] for no sources", () => {
    expect(unlicensedSources([])).toEqual([]);
  });

  it("includes sources with entries but no license keys", () => {
    const sources = [
      makeSource({ key: "grimoire-system", title: "Grimoire System", license_keys: [], class_count: 12, monster_count: 0, entry_count: 12 }),
      makeSource({ key: "grimoire-bundled", title: "Grimoire Bundled", license_keys: [], monster_count: 5 }),
    ];

    const result = unlicensedSources(sources);
    expect(result.map((s) => s.key)).toEqual(["grimoire-bundled", "grimoire-system"]);
  });

  it("excludes sources with a license, regardless of entry count", () => {
    const licensed = makeSource({ key: "tob3", title: "Tome of Beasts 3", license_keys: ["ogl-10a"], monster_count: 50 });
    expect(unlicensedSources([licensed])).toEqual([]);
  });

  it("excludes unlicensed sources with zero entries", () => {
    const empty = makeSource({ key: "empty-src", title: "Empty Src", license_keys: [], monster_count: 0 });
    expect(unlicensedSources([empty])).toEqual([]);
  });

  it("orders results by sort_order then title", () => {
    const sources = [
      makeSource({ key: "b", title: "Beta", license_keys: [], sort_order: 1 }),
      makeSource({ key: "a", title: "Alpha", license_keys: [], sort_order: 0 }),
    ];
    expect(unlicensedSources(sources).map((s) => s.key)).toEqual(["a", "b"]);
  });
});
