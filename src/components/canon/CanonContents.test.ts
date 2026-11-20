import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonContents from "./CanonContents.vue";
import { CANON_SECTIONS, type CanonSectionId } from "@/lib/canon/canonParts";

const counts = (over: Partial<Record<CanonSectionId, number>> = {}) =>
  Object.fromEntries(CANON_SECTIONS.map((s) => [s.id, over[s.id] ?? 0])) as Record<CanonSectionId, number>;

describe("CanonContents", () => {
  // Bug caught: the table's badge showing a bare number, which reads as a count of entries rather than lines to review.
  it("reads the table's count as 'n new' and hides it at zero", () => {
    expect(mount(CanonContents, { props: { active: "premise", counts: counts({ table: 4 }) } }).get("[data-testid=count-table]").text()).toBe("4 new");
    expect(mount(CanonContents, { props: { active: "premise", counts: counts() } }).find("[data-testid=count-table]").exists()).toBe(false);
  });

  // Bug caught: the Narrator's part listed as one more chapter, with no rule and no word on who fills it.
  it("sets What the table added apart with its hint, and lists the Chronicle with its count", () => {
    const w = mount(CanonContents, { props: { active: "premise", counts: counts({ chronicle: 31 }) } });
    expect(w.get("[data-testid=count-chronicle]").text()).toBe("31");
    expect(w.text()).toContain("Filled by the Narrator as it invents.");
    expect(w.get("li:last-child").classes()).toContain("border-t");
  });
});
