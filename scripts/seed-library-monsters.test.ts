import { describe, expect, it } from "vitest";
import { libraryMonsterId } from "./seed-library-monsters";

describe("libraryMonsterId", () => {
  it("prefixes and sanitizes a 2014-edition source_record_key", () => {
    expect(libraryMonsterId("srd_goblin")).toBe("srd_srd_goblin");
  });

  it("prefixes and sanitizes a 2024-edition source_record_key", () => {
    expect(libraryMonsterId("srd-2024_adult-red-dragon")).toBe("srd_srd_2024_adult_red_dragon");
  });

  it("stays distinct across editions for the same creature name", () => {
    const id2014 = libraryMonsterId("srd_adult-red-dragon");
    const id2024 = libraryMonsterId("srd-2024_adult-red-dragon");
    expect(id2014).not.toBe(id2024);
  });

  it("collapses runs of non-alphanumeric characters and trims leading/trailing underscores", () => {
    expect(libraryMonsterId("--Weird//Key!!")).toBe("srd_weird_key");
  });
});
