import { describe, expect, it } from "vitest";
import { backgroundSeedDocuments } from "./useBackgrounds";

describe("backgroundSeedDocuments", () => {
  it("seeds only the character's SRD when the player enabled nothing", () => {
    expect(backgroundSeedDocuments("2014", [])).toEqual(["srd-2014"]);
    expect(backgroundSeedDocuments("2024", [])).toEqual(["srd-2024"]);
  });

  it("adds the player's books after the baseline", () => {
    expect(backgroundSeedDocuments("2024", ["toh", "kp"])).toEqual(["srd-2024", "toh", "kp"]);
  });

  it("translates a slug to its Open5e document key", () => {
    expect(backgroundSeedDocuments("2014", ["blackflag", "cc"])).toEqual(["srd-2014", "bfrd", "ccdx"]);
  });

  it("drops duplicates and our own bundled content", () => {
    expect(backgroundSeedDocuments("2014", ["srd-2014", "toh", "toh", "grimoire-bundled"])).toEqual(["srd-2014", "toh"]);
  });
});
