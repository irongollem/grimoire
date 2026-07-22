import { describe, expect, it } from "vitest";
import { countByRuleset, parseSeedCliArgs, withOpen5eUserAgent } from "./seed-helpers";

describe("withOpen5eUserAgent", () => {
  it("adds a descriptive User-Agent for api.open5e.com requests", () => {
    const headers = withOpen5eUserAgent("https://api.open5e.com/v2/spells/?limit=500");
    expect(new Headers(headers).get("User-Agent")).toBe("grimoire-seed-script (+https://dungeongrimoire.com)");
  });

  it("preserves existing headers alongside the injected User-Agent", () => {
    const headers = withOpen5eUserAgent("https://api.open5e.com/v2/spells/", { Accept: "application/json" });
    const merged = new Headers(headers);
    expect(merged.get("Accept")).toBe("application/json");
    expect(merged.get("User-Agent")).toBe("grimoire-seed-script (+https://dungeongrimoire.com)");
  });

  it("leaves non-Open5e requests untouched", () => {
    const headers = withOpen5eUserAgent("https://example.test/rest/v1/srd_spells", { Accept: "application/json" });
    expect(headers).toEqual({ Accept: "application/json" });
  });

  it("leaves undefined headers as undefined for non-Open5e requests", () => {
    expect(withOpen5eUserAgent("https://example.test/rest/v1/srd_spells")).toBeUndefined();
  });
});

describe("parseSeedCliArgs", () => {
  it("defaults every flag to false and documentKeys to empty with no args", () => {
    expect(parseSeedCliArgs([])).toEqual({ list: false, all: false, dryRun: false, documentKeys: [] });
  });

  it("recognizes --list, --all, and --dry-run independently of order", () => {
    expect(parseSeedCliArgs(["--dry-run", "--all"])).toEqual({
      list: false, all: true, dryRun: true, documentKeys: [],
    });
    expect(parseSeedCliArgs(["--list"])).toEqual({
      list: true, all: false, dryRun: false, documentKeys: [],
    });
  });

  it("collects bare args as explicit document keys", () => {
    expect(parseSeedCliArgs(["srd-2014", "srd-2024"])).toEqual({
      list: false, all: false, dryRun: false, documentKeys: ["srd-2014", "srd-2024"],
    });
  });

  it("separates flags from document keys regardless of interleaving", () => {
    expect(parseSeedCliArgs(["srd-2014", "--dry-run", "srd-2024"])).toEqual({
      list: false, all: false, dryRun: true, documentKeys: ["srd-2014", "srd-2024"],
    });
  });
});

describe("countByRuleset", () => {
  it("returns an empty object for no rows", () => {
    expect(countByRuleset([])).toEqual({});
  });

  it("tallies rows per ruleset", () => {
    const rows = [{ ruleset: "2014" }, { ruleset: "2024" }, { ruleset: "2014" }, { ruleset: "2014" }];
    expect(countByRuleset(rows)).toEqual({ "2014": 3, "2024": 1 });
  });
});
