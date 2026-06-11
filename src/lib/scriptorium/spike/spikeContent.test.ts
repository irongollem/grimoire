import { describe, it, expect } from "vitest";
import { buildSpikeContent, SPIKE_SCENARIOS } from "./spikeContent";

describe("buildSpikeContent", () => {
  it("is deterministic", () => {
    expect(buildSpikeContent("full", 30)).toBe(buildSpikeContent("full", 30));
  });

  it("every scenario produces a cover and at least one chapter", () => {
    for (const s of SPIKE_SCENARIOS) {
      const html = buildSpikeContent(s, 10);
      expect(html).toContain('data-type="coverPage"');
      expect(html).toContain("Chapter 1");
    }
  });

  it("single scenario has no two-column wrappers; others do", () => {
    expect(buildSpikeContent("single", 30)).not.toContain("phb-two-col");
    expect(buildSpikeContent("twocol", 30)).toContain("phb-two-col");
  });

  it("gutter scenario includes gutter-bleed floats, twocol does not", () => {
    expect(buildSpikeContent("gutter", 30)).toContain("sc-img-wrap--gutter");
    expect(buildSpikeContent("twocol", 30)).not.toContain("sc-img-wrap");
  });

  it("full scenario includes wide blocks and stat blocks", () => {
    const html = buildSpikeContent("full", 30);
    expect(html).toContain("sc-wide");
    expect(html).toContain("sc-class-table");
  });

  it("scales chapter count with target pages", () => {
    const small = buildSpikeContent("full", 10);
    const large = buildSpikeContent("full", 100);
    expect((large.match(/<h1>/g) ?? []).length).toBeGreaterThan(
      (small.match(/<h1>/g) ?? []).length,
    );
  });
});
