import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBackgrounds } from "@/lib/library/open5eBackgroundImport";

afterEach(() => vi.unstubAllGlobals());

describe("Open5e V2 background identity", () => {
  it("preserves same-name 2014 and 2024 records and maps revised feats", async () => {
    const legacyDocument = {
      key: "srd-2014",
      name: "System Reference Document 5.1",
      display_name: "5e 2014 Rules",
      gamesystem: { key: "5e-2014", name: "5th Edition 2014" },
      licenses: [{ key: "cc-by-40", name: "CC BY 4.0" }],
    };
    const revisedDocument = {
      key: "srd-2024",
      name: "System Reference Document 5.2",
      display_name: "5e 2024 Rules",
      gamesystem: { key: "5e-2024", name: "5th Edition 2024" },
      licenses: [{ key: "cc-by-40", name: "CC BY 4.0" }],
    };
    const records = [
      {
        key: "srd_acolyte", name: "Acolyte", desc: "", document: legacyDocument,
        benefits: [{ type: "feature", name: "Shelter of the Faithful", desc: "Shelter." }],
      },
      {
        key: "srd-2024_acolyte", name: "Acolyte", desc: "", document: revisedDocument,
        benefits: [
          { type: "feat", name: "Feat", desc: "Magic Initiate (Cleric)" },
          { type: "skill_proficiency", name: "Skills", desc: "Insight and Religion" },
          { type: "ability_score", name: "Ability Scores", desc: "Intelligence, Wisdom, Charisma" },
        ],
      },
    ];

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(JSON.stringify({
        count: url.includes("/documents/") ? 2 : 2,
        next: null,
        results: url.includes("/documents/") ? [legacyDocument, revisedDocument] : records,
      }));
    }));

    const backgrounds = await fetchBackgrounds();
    expect(backgrounds).toHaveLength(2);
    expect(backgrounds.map(background => background.conceptual_key)).toEqual(["acolyte", "acolyte"]);
    expect(backgrounds.map(background => background.ruleset)).toEqual(["2014", "2024"]);
    expect(backgrounds.map(background => background.source_record_key)).toEqual([
      "srd_acolyte", "srd-2024_acolyte",
    ]);
    expect(backgrounds[1]).toMatchObject({
      feat_grant_name: "Magic Initiate (Cleric)",
      skill_proficiencies: ["Insight", "Religion"],
      source_license: "cc-by-40",
      origin_feat: { name: "Magic Initiate", variant: "Cleric" },
      asi_ability_trio: ["intelligence", "wisdom", "charisma"],
    });
    // The 2014 record has no ability_score/feat benefits — both new fields stay null
    // rather than inheriting anything from the 2024 sibling.
    expect(backgrounds[0]).toMatchObject({ origin_feat: null, asi_ability_trio: null });
  });
});

describe("Open5e V2 background fields", () => {
  const doc2014 = {
    key: "srd-2014", name: "System Reference Document 5.1", display_name: "5e 2014 Rules",
    gamesystem: { key: "5e-2014", name: "5th Edition 2014" }, licenses: [{ key: "cc-by-40", name: "CC BY 4.0" }],
    publication_date: "2023-01-01",
  };
  const docA5e = { key: "a5e-ag", name: "Adventurer's Guide", gamesystem: { key: "a5e", name: "A5E" }, licenses: [{ key: "ogl-10a", name: "OGL" }] };
  type Benefit = { type: string; name: string; desc: string };

  /** Fetches one background through a stubbed Open5e, returning it and the urls asked for. */
  async function load(benefits: Benefit[], extra: { desc?: string; embedded?: Record<string, unknown> } = {}, sourceKeys?: string[]) {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      const results = url.includes("/documents/")
        ? [doc2014, docA5e]
        : [{ key: "srd_x", name: "Sage", desc: extra.desc ?? "", document: extra.embedded ?? doc2014, benefits }];
      return new Response(JSON.stringify({ count: results.length, next: null, results }));
    }));
    const [background] = await fetchBackgrounds(sourceKeys);
    return { background, urls };
  }
  const benefit = (type: string, desc: string, name = "Name"): Benefit => ({ type, name, desc });

  it.each([
    ["a comma list", "Arcana, History", ["Arcana", "History"]],
    ["a semicolon list", "Arcana; History", ["Arcana", "History"]],
    ["an 'and' list", "Arcana and History", ["Arcana", "History"]],
    ["a dash for none", "—", []],
    ["a hyphen for none", "-", []],
    ["the word none", "None", []],
    // A choice is one entry, not two skills, and loses its trailing full stop.
    ["a choice of skills", "Two of your choice.", ["Two of your choice"]],
    ["an either-or", "Either Arcana or History", ["Either Arcana or History"]],
  ])("reads skills from %s", async (_what, desc, expected) => {
    const { background } = await load([benefit("skill_proficiency", desc)]);
    expect(background?.skill_proficiencies).toEqual(expected);
  });

  it("canonicalises tool names and drops prose that names no tool", async () => {
    const herbal = await load([benefit("tool_proficiency", "Herbalist kit")]);
    expect(herbal.background?.tool_proficiencies).toEqual(["Herbalism Kit"]);
    const none = await load([benefit("tool_proficiency", "No additional tool proficiencies")]);
    expect(none.background?.tool_proficiencies).toEqual([]);
  });

  it("keeps languages and equipment, trimmed", async () => {
    const { background } = await load([benefit("language", "Elvish, Dwarvish"), benefit("equipment", "  A holy symbol. ")]);
    expect(background?.languages).toEqual(["Elvish", "Dwarvish"]);
    expect(background?.equipment).toBe("A holy symbol.");
  });

  it("offers an ability trio only when all three abilities parse", async () => {
    const two = await load([benefit("ability_score", "Intelligence, Wisdom")]);
    expect(two.background?.asi_ability_trio).toBeNull();
    const three = await load([benefit("ability_score", "Intelligence, Wisdom, Charisma")]);
    expect(three.background?.asi_ability_trio).toEqual(["intelligence", "wisdom", "charisma"]);
  });

  it("takes the feature from the feature benefit, else adventures and advancement, else an unclassified benefit, never the feat", async () => {
    const both = await load([benefit("adventures_and_advancement", "A", "Advance"), benefit("feature", "F", "Shelter")]);
    expect(both.background?.feature_name).toBe("Shelter");
    const advance = await load([benefit("special", "S", "Odd Gift"), benefit("adventures_and_advancement", "A", "Advance")]);
    expect(advance.background?.feature_name).toBe("Advance");
    const other = await load([benefit("special", "S", "Odd Gift")]);
    expect(other.background?.feature_name).toBe("Odd Gift");
    const featOnly = await load([benefit("feat", "Alert", "Feat")]);
    expect(featOnly.background?.feature_name).toBeNull();
  });

  it("trims the description and turns a blank one into null", async () => {
    expect((await load([], { desc: "  Studied.  " })).background?.description).toBe("Studied.");
    expect((await load([], { desc: "   " })).background?.description).toBeNull();
  });

  it("names the source and its revision from the document listing, not the thinner record copy", async () => {
    const { background } = await load([], { embedded: { key: "srd-2014", name: "System Reference Document 5.1" } });
    expect(background).toMatchObject({
      source: "srd-2014", source_title: "5e 2014 Rules", source_revision: "2023-01-01", source_license: "cc-by-40",
    });
  });

  it("scopes the fetch to the documents asked for, else to every document with a 5e ruleset", async () => {
    const scoped = await load([], {}, ["srd-2014", "a5e-ag"]);
    expect(decodeURIComponent(scoped.urls.find((u) => u.includes("/backgrounds/")) ?? "")).toContain("document__key__in=srd-2014,a5e-ag");
    const all = await load([]);
    const url = decodeURIComponent(all.urls.find((u) => u.includes("/backgrounds/")) ?? "");
    expect(url).toContain("document__key__in=srd-2014");
    expect(url).not.toContain("a5e-ag");
  });
});
