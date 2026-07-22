import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBackgrounds } from "./open5eBackgroundImport";

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
