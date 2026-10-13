import { describe, expect, it } from "vitest";
import { parseMechanics } from "@/rules/features/mechanics";
import { OPEN5E_2014_FEATURES } from "./open5e2014";
import { SRD_2014_FEATURES } from "./srd2014";
import knownKeys from "./open5e2014.keys.json";

const known = new Set<string>(knownKeys);

describe("Open5e 2014 archetype catalogue", () => {
  it("every entry passes parseMechanics cleanly and round-trips", () => {
    for (const [key, mechanics] of Object.entries(OPEN5E_2014_FEATURES)) {
      const parsed = parseMechanics(mechanics);
      expect(parsed.errors, key).toEqual([]);
      expect(parsed.mechanics, key).toEqual(mechanics);
    }
  });

  it("only names features the library has", () => {
    for (const key of Object.keys(OPEN5E_2014_FEATURES)) expect(known.has(key), key).toBe(true);
  });

  it("never shadows an SRD entry", () => {
    for (const key of Object.keys(OPEN5E_2014_FEATURES)) {
      expect(key in SRD_2014_FEATURES, key).toBe(false);
    }
  });
});
