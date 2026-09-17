import { describe, expect, it } from "vitest";
import { buildTileProvenance } from "./tileProvenance";

describe("buildTileProvenance", () => {
  it("builds a tile-generatorType record from the given provider/model", () => {
    expect(buildTileProvenance("openai", "gpt-image-2", "2026-09-17T00:00:00.000Z")).toEqual({
      generatorType: "tile",
      provider: "openai",
      model: "gpt-image-2",
      generatedAt: "2026-09-17T00:00:00.000Z",
      edited: false,
    });
  });

  it("never returns edited: true — a freshly generated tile has no human edit yet", () => {
    expect(buildTileProvenance("openai", "gpt-image-2").edited).toBe(false);
  });

  it("defaults generatedAt to the current time when omitted", () => {
    const before = Date.now();
    const prov = buildTileProvenance("openai", "gpt-image-2");
    const after = Date.now();
    const at = new Date(prov.generatedAt).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
  });
});
