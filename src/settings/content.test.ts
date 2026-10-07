import { describe, expect, it } from "vitest";
import { loadSettingContent } from "./content";
import { getSetting, listSettings } from "./index";

describe("setting content loader", () => {
  it("has seed content for every setting the light registry lists", async () => {
    for (const meta of listSettings()) {
      const content = await loadSettingContent(meta.id);
      expect(content, meta.id).not.toBeNull();
      expect(content?.locations.length, meta.id).toBeGreaterThan(0);
      expect(content?.defaultAiPrompt.length, meta.id).toBeGreaterThan(0);
    }
  });

  it("returns null for an id that is not a built-in setting", async () => {
    await expect(loadSettingContent("homebrew")).resolves.toBeNull();
    await expect(loadSettingContent("custom")).resolves.toBeNull();
  });

  it("memoises: one load per setting yields the same content object", async () => {
    const [a, b] = await Promise.all([loadSettingContent("faerun"), loadSettingContent("faerun")]);
    expect(a).toBe(b);
  });
});

describe("setting registry", () => {
  it("answers label and calendar without any seed content", () => {
    const meta = getSetting("greyhawk");
    expect(meta?.label).toBe("Greyhawk");
    expect(meta?.calendar.epochName).toBe("CY");
    expect(meta).not.toHaveProperty("locations");
  });
});
