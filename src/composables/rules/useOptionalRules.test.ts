import { describe, expect, it, vi } from "vitest";

// useOptionalRules.ts imports @/lib/supabase, which throws at module load when
// env vars are absent (CI, plain test runs). The function under test is a pure
// row transform — stub the supabase module so the import resolves.
vi.mock("@/lib/supabase", () => ({
  supabase: {},
  getCurrentUser: () => null,
}));

import { resolveRuleConfig, isRuleEffectivelyEnabled } from "./useOptionalRules";
import type { CampaignRule } from "@/types/rule.types";

function row(partial: Partial<CampaignRule>): CampaignRule {
  return {
    campaign_id: "c1",
    rule_key: "turn_timer",
    enabled: true,
    config: null,
    updated_at: "",
    ...partial,
  };
}

describe("resolveRuleConfig", () => {
  it("falls back to registry defaults when no row exists", () => {
    // turn_timer declares { seconds: default 60 }
    expect(resolveRuleConfig(undefined, "turn_timer")).toEqual({ seconds: 60 });
    expect(resolveRuleConfig([], "turn_timer")).toEqual({ seconds: 60 });
  });

  it("falls back to defaults when the row has null config", () => {
    expect(resolveRuleConfig([row({ config: null })], "turn_timer")).toEqual({ seconds: 60 });
  });

  it("uses the stored value when present", () => {
    expect(resolveRuleConfig([row({ config: { seconds: 90 } })], "turn_timer")).toEqual({
      seconds: 90,
    });
  });

  it("ignores stray non-numeric stored values and uses the default", () => {
    // A malformed config field (e.g. hand-edited backup) must not leak through.
    const bad = [row({ config: { seconds: "oops" } as unknown as CampaignRule["config"] })];
    expect(resolveRuleConfig(bad, "turn_timer")).toEqual({ seconds: 60 });
  });

  it("returns an empty object for a rule that declares no config", () => {
    expect(resolveRuleConfig([], "random_initiative")).toEqual({});
  });
});

describe("isRuleEffectivelyEnabled", () => {
  it("respects an explicit row over the registry default", () => {
    expect(isRuleEffectivelyEnabled([row({ rule_key: "turn_timer", enabled: true })], "turn_timer")).toBe(true);
    expect(isRuleEffectivelyEnabled([row({ rule_key: "turn_timer", enabled: false })], "turn_timer")).toBe(false);
  });

  it("falls back to the rule's defaultEnabled when no row exists", () => {
    // turn_timer + random_initiative both default to off.
    expect(isRuleEffectivelyEnabled([], "turn_timer")).toBe(false);
    expect(isRuleEffectivelyEnabled(undefined, "random_initiative")).toBe(false);
  });
});
