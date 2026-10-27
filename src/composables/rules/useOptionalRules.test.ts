import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { useCampaignStore } from "@/stores/campaign";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => null }));

import { resolveRuleConfig, isRuleEffectivelyEnabled, useOptionalRules, useUpsertCampaignRule } from "./useOptionalRules";
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

  it("keeps an on-by-default rule on when it has no row, and an unknown key off", () => {
    // "crafting" ships on: a campaign that never touched it must keep its tab.
    expect(isRuleEffectivelyEnabled([], "crafting")).toBe(true);
    expect(isRuleEffectivelyEnabled([], "not_a_rule")).toBe(false);
  });
});

describe("campaign rules over the database", () => {
  function run<T>(setup: () => T): T {
    let out!: T;
    mount(
      defineComponent({ setup() { out = setup(); return () => null; } }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
    );
    return out;
  }

  beforeEach(() => {
    fake.reset();
    setActivePinia(createPinia());
    useCampaignStore().activeCampaignId = "c1";
  });

  it("reads the active campaign's rules and no other campaign's", async () => {
    fake.seed("campaign_rules", [
      { ...row({ rule_key: "turn_timer" }) },
      { ...row({ rule_key: "flanking", campaign_id: "c2" }) },
    ]);
    const rules = run(() => useOptionalRules());
    await flushPromises();
    expect(rules.data.value?.map((r) => r.rule_key)).toEqual(["turn_timer"]);
  });

  it("reads nothing without an active campaign", async () => {
    useCampaignStore().activeCampaignId = null;
    const rules = run(() => useOptionalRules());
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(rules.isError.value).toBe(false);
  });

  it("toggling a rule changes its one row, keeps the tuned config, and leaves other campaigns' rows alone", async () => {
    useCampaignStore().activeCampaignId = "c9";
    fake.seed("campaign_rules", [
      { ...row({ rule_key: "turn_timer", enabled: true, campaign_id: "c2" }) },
      { ...row({ rule_key: "turn_timer", enabled: true, config: { seconds: 90 }, campaign_id: "c9" }) },
    ]);
    const upsert = run(() => useUpsertCampaignRule());
    await upsert.mutateAsync({ ruleKey: "turn_timer", enabled: false, config: { seconds: 90 } });
    const rows = fake.rows("campaign_rules");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.campaign_id === "c9")).toMatchObject({ enabled: false, config: { seconds: 90 } });
    expect(rows.find((r) => r.campaign_id === "c2")).toMatchObject({ enabled: true });
  });
});
