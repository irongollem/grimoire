import { describe, expect, it } from "vitest";
import {
  isRulesetAdmissible,
  otherRuleset,
  parseRulesetBounce,
  rulesetLabel,
  rulesetRules,
  rulesetYear,
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
  it("names an edition the way the picker does", () => {
    expect(rulesetLabel("2014")).toBe("D&D 5e (2014)");
    expect(rulesetLabel("2024")).toBe("D&D 5e (2024)");
  });

  it("knows the other edition", () => {
    expect(otherRuleset("2014")).toBe("2024");
    expect(otherRuleset("2024")).toBe("2014");
  });
});

describe("edition wording", () => {
  it("names an edition for a picker or a standalone label", () => {
    expect(rulesetLabel("2014")).toBe("D&D 5e (2014)");
    expect(rulesetLabel("2024")).toBe("D&D 5e (2024)");
  });

  it("names it for a sentence or a button", () => {
    expect(rulesetRules("2014")).toBe("2014 rules");
    expect(rulesetRules("2024")).toBe("2024 rules");
  });

  it("gives the bare year for a compact suffix", () => {
    expect(rulesetYear("2014")).toBe("2014");
    expect(rulesetYear("2024")).toBe("2024");
  });
});
