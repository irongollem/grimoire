import { describe, expect, it } from "vitest";
import type { ClassFeature } from "@/types/feature.types";
import { filterFeats, isFeat } from "./featOptions";
import { mapFeatureIds } from "./types";

const row = (name: string, source_record_key: string | null) =>
  ({ id: name, name, description: null, source_record_key }) as unknown as ClassFeature;

describe("isFeat", () => {
  it("accepts a document-slug key and rejects class-scoped and legacy keys", () => {
    expect(isFeat({ source_record_key: "srd-2024_alert" })).toBe(true);
    expect(isFeat({ source_record_key: "srd_grappler" })).toBe(true);
    expect(isFeat({ source_record_key: "srd-2024_paladin_aura-of-courage" })).toBe(false);
    expect(isFeat({ source_record_key: "legacy:720e47dd-3e60" })).toBe(false);
    expect(isFeat({ source_record_key: null })).toBe(false);
  });
});

describe("filterFeats", () => {
  const rows = [row("Alert", "srd-2024_alert"), row("Rage", "srd-2024_barbarian_rage"), row("Lucky", "srd-2024_lucky")];
  it("lists only feats, narrowed by name", () => {
    expect(filterFeats(rows, "").map(f => f.name)).toEqual(["Alert", "Lucky"]);
    expect(filterFeats(rows, " luc ").map(f => f.name)).toEqual(["Lucky"]);
  });
});

describe("mapFeatureIds", () => {
  const id = "0b512bc0-0102-43d9-9a7a-ed23883eb5b3";
  it("never returns an unresolved id, but keeps a plain name", () => {
    const known = { id: "k", name: "Channel Divinity", description: null } as unknown as ClassFeature;
    expect(mapFeatureIds([id, "Wild Shape", "k"], new Map([["k", known]]))).toEqual(["Wild Shape", "Channel Divinity"]);
  });
});
