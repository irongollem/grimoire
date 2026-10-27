import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { RulesetKey } from "@/types/ruleset.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import {
  isRulesetAdmissible,
  otherRuleset,
  parseRulesetBounce,
  rulesetLabel,
  rulesetRules,
  rulesetYear,
  useConvertCharacterCopy,
  useConvertCharacterRuleset,
} from "./useCharacterRuleset";

describe("isRulesetAdmissible", () => {
  it("takes a character of the table's own edition", () => {
    expect(isRulesetAdmissible({ ruleset: "2014" }, { ruleset: "2014", allows_mixed_rulesets: false })).toBe(true);
  });

  it("refuses the other edition at a table that does not allow both", () => {
    expect(isRulesetAdmissible({ ruleset: "2024" }, { ruleset: "2014", allows_mixed_rulesets: false })).toBe(false);
  });

  it("takes the other edition at a table that allows both", () => {
    expect(isRulesetAdmissible({ ruleset: "2024" }, { ruleset: "2014", allows_mixed_rulesets: true })).toBe(true);
  });
});

describe("parseRulesetBounce", () => {
  // The shape PostgREST returns for the RS001 raised by assert_ruleset_admissible().
  const bounce = {
    code: "RS001",
    message: "This table plays the 2014 rules and does not take 2024 characters",
    details: '{"character_ruleset": "2024", "campaign_ruleset": "2014"}',
    hint: null,
  };

  it("reads both editions out of a bounce", () => {
    expect(parseRulesetBounce(bounce)).toEqual({ characterRuleset: "2024", campaignRuleset: "2014" });
  });

  it("is null for any other failure, so it is shown as the error it is", () => {
    expect(parseRulesetBounce({ ...bounce, code: "P0001" })).toBeNull();
    expect(parseRulesetBounce(new Error("network down"))).toBeNull();
    expect(parseRulesetBounce(null)).toBeNull();
    expect(parseRulesetBounce("RS001")).toBeNull();
  });

  it("is null rather than a guess when the detail is not what the database sends", () => {
    expect(parseRulesetBounce({ ...bounce, details: null })).toBeNull();
    expect(parseRulesetBounce({ ...bounce, details: "not json" })).toBeNull();
    expect(parseRulesetBounce({ ...bounce, details: '{"character_ruleset": "3e", "campaign_ruleset": "2014"}' })).toBeNull();
    expect(parseRulesetBounce({ ...bounce, details: '{"character_ruleset": "2024"}' })).toBeNull();
  });
});

describe("edition names", () => {
  it("names an edition for a picker or a standalone label", () => {
    expect(rulesetLabel("2014")).toBe("D&D 5e (2014)");
    expect(rulesetLabel("2024")).toBe("D&D 5e (2024)");
  });

  it("knows the other edition", () => {
    expect(otherRuleset("2014")).toBe("2024");
    expect(otherRuleset("2024")).toBe("2014");
  });

  it("names it for a sentence or a button", () => {
    expect(rulesetRules("2014")).toBe("2014 rules");
    expect(rulesetRules("2024")).toBe("2024 rules");
  });

  it("refuses an edition that does not exist rather than printing it", () => {
    const unknown = "3e" as RulesetKey;
    expect(() => rulesetLabel(unknown)).toThrow(/Unknown ruleset/);
    expect(() => rulesetYear(unknown)).toThrow(/Unknown ruleset/);
    expect(() => rulesetRules(unknown)).toThrow(/Unknown ruleset/);
  });
});

describe("converting a character", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");

  function inApp<T>(setup: () => T): T {
    let out!: T;
    mount(
      defineComponent({
        setup() {
          out = setup();
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
    );
    return out;
  }

  beforeEach(() => {
    fake.reset();
    invalidate.mockClear();
  });

  it("converts in place to the edition asked for and refreshes everything that renders a character", async () => {
    const seen: unknown[] = [];
    fake.onRpc("convert_party_member_ruleset", (args) => {
      seen.push([args.p_party_member_id, args.p_ruleset]);
      return null;
    });
    await inApp(() => useConvertCharacterRuleset()).mutateAsync({ partyMemberId: "pm1", ruleset: "2024" });
    expect(seen).toEqual([["pm1", "2024"]]);
    const refreshed = invalidate.mock.calls.map(([filters]) =>
      filters !== undefined && typeof filters !== "function" && Array.isArray(filters.queryKey) ? filters.queryKey[0] : undefined,
    );
    expect(refreshed).toEqual(expect.arrayContaining(["party", "character-pool", "my-characters", "character_classes", "character_spells", "ruleset_reviews"]));
  });

  it("a refused conversion reaches the caller and refreshes nothing", async () => {
    fake.failNext("convert_party_member_ruleset", { message: "not yours" });
    await expect(inApp(() => useConvertCharacterRuleset()).mutateAsync({ partyMemberId: "pm1", ruleset: "2024" })).rejects.toMatchObject({
      message: "not yours",
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("a converted copy answers with the copy's id, and an answer without one is an error", async () => {
    fake.onRpc("convert_party_member_copy", () => "copy-1");
    const copy = inApp(() => useConvertCharacterCopy());
    expect(await copy.mutateAsync({ partyMemberId: "pm1", ruleset: "2024" })).toBe("copy-1");

    fake.onRpc("convert_party_member_copy", () => null);
    await expect(copy.mutateAsync({ partyMemberId: "pm1", ruleset: "2024" })).rejects.toThrow(/without an id/);
  });
});
