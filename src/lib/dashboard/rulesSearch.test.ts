import { describe, it, expect } from "vitest";
import { RULES_SEARCH_RESULT_LIMIT, searchLibraryRules } from "./rulesSearch";
import type { LibraryRule } from "@/types/rule.types";

// Every VersionedContentMetadata field is optional, so this covers the whole
// type — no cast needed, and nothing here goes untyped.
function rule(id: string, name: string, content: string): LibraryRule {
  return {
    id,
    slug: id,
    name,
    content,
    parent_slug: null,
    doc_slug: "srd-2014",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

const GRAPPLED = rule("grappled", "Grappled", "A grappled creature's speed becomes 0.");
const GRAPPLING = rule(
  "grapple-action",
  "Actions in Combat",
  "When you want to grapple a creature, make a Strength (Athletics) check.",
);
const BLINDED = rule("blinded", "Blinded", "A blinded creature can't see.");

describe("searchLibraryRules", () => {
  it("returns nothing for an empty query", () => {
    expect(searchLibraryRules([GRAPPLED, GRAPPLING, BLINDED], "")).toEqual([]);
  });

  it("returns nothing for a whitespace-only query", () => {
    expect(searchLibraryRules([GRAPPLED, GRAPPLING, BLINDED], "   ")).toEqual([]);
  });

  it("matches a query found in the title", () => {
    expect(searchLibraryRules([GRAPPLED, BLINDED], "grapp")).toEqual([GRAPPLED]);
  });

  it("matches a query found only in the body text", () => {
    // "Athletics" appears only in Actions in Combat's content, not its name.
    expect(searchLibraryRules([GRAPPLED, GRAPPLING, BLINDED], "athletics")).toEqual([GRAPPLING]);
  });

  it("is case-insensitive on both name and content", () => {
    expect(searchLibraryRules([GRAPPLED], "GRAPP")).toEqual([GRAPPLED]);
    expect(searchLibraryRules([GRAPPLING], "ATHLETICS")).toEqual([GRAPPLING]);
  });

  it("returns nothing when the query matches no rule", () => {
    expect(searchLibraryRules([GRAPPLED, GRAPPLING, BLINDED], "fireball")).toEqual([]);
  });

  it("ranks a title match ahead of a body-only match for the same query", () => {
    // Both rules contain "grapple" somewhere: GRAPPLED in its name, GRAPPLING
    // only in its content. The title hit must come first regardless of the
    // order the rules were passed in.
    expect(searchLibraryRules([GRAPPLING, GRAPPLED], "grapple")).toEqual([GRAPPLED, GRAPPLING]);
  });

  it("never lists a title match twice even though it would also satisfy the body test", () => {
    const result = searchLibraryRules([GRAPPLED], "grapp");
    expect(result).toHaveLength(1);
  });

  it("caps results at the given limit", () => {
    const rules = Array.from({ length: 10 }, (_, i) => rule(`r${i}`, `Rule ${i}`, "shared text"));
    expect(searchLibraryRules(rules, "rule", 3)).toHaveLength(3);
  });

  it("defaults the limit to RULES_SEARCH_RESULT_LIMIT", () => {
    const rules = Array.from({ length: RULES_SEARCH_RESULT_LIMIT + 5 }, (_, i) =>
      rule(`r${i}`, `Rule ${i}`, "shared text"),
    );
    expect(searchLibraryRules(rules, "rule")).toHaveLength(RULES_SEARCH_RESULT_LIMIT);
  });
});
