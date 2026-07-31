import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllFromDocuments,
  fetchOpen5eDocumentRefs,
  fetchSupported5eDocumentKeys,
  formatLicenseKeys,
  isRedistributable,
  licenseForDocumentKey,
  licenseKeysFor,
  LEGACY_DOCUMENT_KEY_ALIASES,
  REDISTRIBUTABLE_LICENSE_KEYS,
  rulesetForDocument,
} from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";

afterEach(() => vi.unstubAllGlobals());

describe("rulesetForDocument", () => {
  it("maps 5e-2024 to the 2024 ruleset", () => {
    expect(rulesetForDocument({ key: "srd-2024", name: "SRD 5.2", gamesystem: { key: "5e-2024", name: "5th Edition 2024" } }))
      .toBe("2024");
  });

  it("maps 5e-2014 to the 2014 ruleset", () => {
    expect(rulesetForDocument({ key: "srd-2014", name: "SRD 5.1", gamesystem: { key: "5e-2014", name: "5th Edition 2014" } }))
      .toBe("2014");
  });

  it("maps the legacy bare '5e' gamesystem key to the 2014 ruleset", () => {
    expect(rulesetForDocument({ key: "wotc-srd", name: "SRD", gamesystem: { key: "5e", name: "5th Edition" } }))
      .toBe("2014");
  });

  it("is case-insensitive on the gamesystem key", () => {
    expect(rulesetForDocument({ key: "srd-2024", name: "SRD 5.2", gamesystem: { key: "5E-2024", name: "5th Edition 2024" } }))
      .toBe("2024");
  });

  it("returns null for a non-5e gamesystem such as a5e", () => {
    expect(rulesetForDocument({ key: "a5e-srd", name: "A5E SRD", gamesystem: { key: "a5e", name: "Level Up A5E" } }))
      .toBeNull();
  });

  it("returns null when the document has no gamesystem", () => {
    expect(rulesetForDocument({ key: "unknown", name: "Unknown Document" })).toBeNull();
  });

  it("returns null for a null or undefined document", () => {
    expect(rulesetForDocument(null)).toBeNull();
    expect(rulesetForDocument(undefined)).toBeNull();
  });
});

describe("fetchSupported5eDocumentKeys", () => {
  it("keeps only documents whose gamesystem maps to a supported ruleset AND whose license permits redistribution", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      count: 4,
      next: null,
      results: [
        { key: "srd-2014", name: "SRD 5.1", gamesystem: { key: "5e-2014", name: "5th Edition 2014" }, licenses: [{ name: "CC-BY 4.0", key: "cc-by-40" }] },
        { key: "srd-2024", name: "SRD 5.2", gamesystem: { key: "5e-2024", name: "5th Edition 2024" }, licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }] },
        { key: "a5e-srd", name: "A5E SRD", gamesystem: { key: "a5e", name: "Level Up A5E" }, licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }] },
        { key: "unconfirmed", name: "Unconfirmed Document", gamesystem: { key: "5e-2014", name: "5th Edition 2014" }, licenses: [] },
      ],
    }))));

    expect(await fetchSupported5eDocumentKeys()).toEqual(["srd-2014", "srd-2024"]);
  });
});

describe("fetchOpen5eDocumentRefs", () => {
  it("returns the raw document list, licenses and all, undiscarded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      count: 1,
      next: null,
      results: [
        {
          key: "ccdx",
          name: "Creature Codex",
          publisher: { name: "Kobold Press", key: "kobold-press" },
          gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
          licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
          permalink: "https://example.test/creature-codex",
        },
      ],
    }))));

    const documents = await fetchOpen5eDocumentRefs();
    expect(documents).toEqual([
      {
        key: "ccdx",
        name: "Creature Codex",
        publisher: { name: "Kobold Press", key: "kobold-press" },
        gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
        licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
        permalink: "https://example.test/creature-codex",
      },
    ]);
  });
});

describe("licenseKeysFor / isRedistributable", () => {
  const withLicenses = (keys: string[]): Open5eDocumentRef => ({
    key: "doc", name: "Doc", licenses: keys.map((key) => ({ name: key, key })),
  });

  it("licenseKeysFor extracts every license key, [] when there are none", () => {
    expect(licenseKeysFor(withLicenses(["ogl-10a", "cc-by-40"]))).toEqual(["ogl-10a", "cc-by-40"]);
    expect(licenseKeysFor({ key: "doc", name: "Doc" })).toEqual([]);
  });

  it("isRedistributable is true when every license key is in the whitelist", () => {
    expect(isRedistributable(withLicenses(["ogl-10a"]))).toBe(true);
    expect(isRedistributable(withLicenses(["cc-by-40", "cc0"]))).toBe(true);
  });

  it("isRedistributable is false for a document with an empty/missing licenses array — unknown licensing is a refusal, not a default-allow", () => {
    expect(isRedistributable(withLicenses([]))).toBe(false);
    expect(isRedistributable({ key: "doc", name: "Doc" })).toBe(false);
  });

  it("isRedistributable is false when any license key falls outside the whitelist", () => {
    expect(isRedistributable(withLicenses(["ogl-10a", "some-other-license"]))).toBe(false);
  });

  it("REDISTRIBUTABLE_LICENSE_KEYS covers every whitelisted license, including 'orc' (never emitted by Open5e itself, only by our own curated corrections)", () => {
    expect(REDISTRIBUTABLE_LICENSE_KEYS).toEqual(["ogl-10a", "cc-by-40", "cc0", "orc"]);
  });
});

describe("formatLicenseKeys", () => {
  it("comma-space joins license keys, matching the stored source_license format", () => {
    expect(formatLicenseKeys(["cc-by-40", "ogl-10a"])).toBe("cc-by-40, ogl-10a");
  });

  it("returns null for an empty list", () => {
    expect(formatLicenseKeys([])).toBeNull();
  });
});

describe("licenseForDocumentKey", () => {
  const document: Open5eDocumentRef = {
    key: "ccdx",
    name: "Creature Codex",
    licenses: [{ name: "OGL 1.0a", key: "ogl-10a" }],
  };

  it("formats the license keys of the document found in the map", () => {
    const map = new Map([["ccdx", document]]);
    expect(licenseForDocumentKey(map, "ccdx")).toBe("ogl-10a");
  });

  it("returns null when the document key is not in the map", () => {
    const map = new Map([["ccdx", document]]);
    expect(licenseForDocumentKey(map, "unknown")).toBeNull();
  });

  it("returns null when no map is provided at all", () => {
    expect(licenseForDocumentKey(undefined, "ccdx")).toBeNull();
  });
});

describe("LEGACY_DOCUMENT_KEY_ALIASES", () => {
  it("maps every legacy source_document_key to its verified current Open5e v2 key", () => {
    expect(LEGACY_DOCUMENT_KEY_ALIASES).toEqual({
      cc: "ccdx",
      blackflag: "bfrd",
      menagerie: "a5e-mm",
      dmag: "deepm",
      "dmag-e": "deepmx",
      warlock: "wz",
      a5e: "a5e-ag",
      o5e: "open5e",
      taldorei: "tdcs",
    });
  });
});

describe("fetchAllFromDocuments", () => {
  it("scopes the request via document__key__in and returns records whose document key was requested", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("document__key__in=srd-2024");
      return new Response(JSON.stringify({
        count: 1,
        next: null,
        results: [{ key: "srd-2024_battleaxe", document: { key: "srd-2024" } }],
      }));
    }));

    const results = await fetchAllFromDocuments<{ key: string; document: { key: string } }>(
      "https://api.open5e.com/v2/weapons/",
      ["srd-2024"],
    );
    expect(results).toEqual([{ key: "srd-2024_battleaxe", document: { key: "srd-2024" } }]);
  });

  it("throws when a returned record's document key was not requested (silent document filter guard)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      count: 1,
      next: null,
      results: [{ key: "a5e-longsword", document: { key: "a5e-srd" } }],
    }))));

    await expect(
      fetchAllFromDocuments<{ key: string; document: { key: string } }>(
        "https://api.open5e.com/v2/weapons/",
        ["srd-2024"],
      ),
    ).rejects.toThrow(/a5e-srd/);
  });

  it("appends the filter with '&' when the base URL already has a query string", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toContain("name__icontains=acolyte&document__key__in=srd-2014");
      return new Response(JSON.stringify({ count: 0, next: null, results: [] }));
    }));

    await fetchAllFromDocuments<{ key: string; document: { key: string } }>(
      "https://api.open5e.com/v2/backgrounds/?name__icontains=acolyte",
      ["srd-2014"],
    );
  });
});
