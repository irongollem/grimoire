import { describe, it, expect } from "vitest";
import type { Rule, TrackerDef } from "@/types/rule.types";
import { parseRuleTrackerCardSettings, resolveRuleTracker } from "./ruleTrackerCard";

const TRACKER: TrackerDef = {
  label: "Sanity",
  type: "points",
  min: 0,
  max: 10,
};

const rule = (id: string, title: string, tracker: TrackerDef | null): Rule => ({
  id,
  user_id: "dm",
  campaign_id: "c1",
  title,
  content: null,
  category: null,
  tags: [],
  is_player_visible: false,
  tracker,
  created_at: "2026-08-24T00:00:00Z",
  updated_at: "2026-08-24T00:00:00Z",
});

const SANITY = rule("r-sanity", "Sanity", TRACKER);
const CORRUPTION = rule("r-corruption", "Corruption", { ...TRACKER, label: "Corruption" });
const NO_TRACKER = rule("r-lore", "Lore Notes", null);

describe("parseRuleTrackerCardSettings", () => {
  it("reads a stored rule id", () => {
    expect(parseRuleTrackerCardSettings({ ruleId: "r-sanity" })).toEqual({ ruleId: "r-sanity" });
  });

  it.each([
    ["absent settings", undefined],
    ["a null blob", null],
    ["an array", ["r-sanity"]],
    ["garbage (a string)", "r-sanity"],
    ["garbage (a number)", 42],
    ["a blob with no ruleId", { width: "cell" }],
    ["a non-string ruleId", { ruleId: 7 }],
    // "" is what EntityCombobox's clear control writes; it is not a choice.
    ["an empty ruleId", { ruleId: "" }],
  ])("reads %s as unconfigured", (_label, raw) => {
    expect(parseRuleTrackerCardSettings(raw)).toEqual({});
  });
});

describe("resolveRuleTracker", () => {
  it("shows the configured rule's tracker", () => {
    const result = resolveRuleTracker({ ruleId: "r-corruption" }, [SANITY, CORRUPTION]);
    expect(result).toEqual({ state: "ready", rule: CORRUPTION });
  });

  // So a freshly added card does something before the DM opens the gear.
  it("falls to the first tracker-bearing rule when unconfigured", () => {
    expect(resolveRuleTracker(undefined, [SANITY, CORRUPTION])).toEqual({
      state: "ready",
      rule: SANITY,
    });
  });

  // The fallback must skip past rules that have no tracker at all, not just
  // pick list position 0.
  it("skips rules whose tracker is null when falling back", () => {
    expect(resolveRuleTracker(undefined, [NO_TRACKER, SANITY])).toEqual({
      state: "ready",
      rule: SANITY,
    });
  });

  it("says so when the campaign has no tracker-bearing rules at all", () => {
    expect(resolveRuleTracker(undefined, [])).toEqual({ state: "none" });
  });

  it("says so when the campaign's only rules have no tracker", () => {
    expect(resolveRuleTracker(undefined, [NO_TRACKER])).toEqual({ state: "none" });
  });

  // The case that must never silently substitute: a card pinned to a rule
  // the DM deleted, or a campaign switch. Showing a different rule's tracker
  // while looking unchanged is worse than saying nothing.
  it("reports a configured rule the campaign does not have, and does not substitute", () => {
    expect(resolveRuleTracker({ ruleId: "r-gone" }, [SANITY, CORRUPTION])).toEqual({
      state: "missing",
      ruleId: "r-gone",
    });
  });

  it("reports missing even when the campaign has no rules at all", () => {
    expect(resolveRuleTracker({ ruleId: "r-gone" }, [])).toEqual({
      state: "missing",
      ruleId: "r-gone",
    });
  });

  // The rule itself can still exist while its tracker was edited away — from
  // here that reads identically to the rule being gone: there is nothing to
  // draw a tracker for, and substituting a different rule's would be the
  // exact mistake this type exists to prevent.
  it("reports missing when the configured rule exists but no longer has a tracker", () => {
    expect(resolveRuleTracker({ ruleId: "r-lore" }, [SANITY, NO_TRACKER])).toEqual({
      state: "missing",
      ruleId: "r-lore",
    });
  });
});
