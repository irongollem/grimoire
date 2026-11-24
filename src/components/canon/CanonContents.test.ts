import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonContents from "./CanonContents.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { CANON_SECTIONS, type CanonSectionId } from "@/lib/canon/canonParts";

const counts = (over: Partial<Record<CanonSectionId, number>> = {}) =>
  Object.fromEntries(CANON_SECTIONS.map((s) => [s.id, over[s.id] ?? 0])) as Record<CanonSectionId, number>;
const mountContents = (over: Partial<Record<CanonSectionId, number>> = {}, active: CanonSectionId = "premise") => mount(CanonContents, { props: { active, counts: counts(over) } });

describe("CanonContents", () => {
  // Bug caught: the chapters listed flat, or in a different order from the book, so the contents did not match the page.
  it("lists the chapters under their four groups, in the book's order", () => {
    const w = mountContents();
    expect(w.findAll("section[data-group]").map((g) => g.attributes("data-group"))).toEqual(["front", "world", "story", "characters"]);
    expect(w.findAll("section h2").map((h) => h.text())).toEqual(["Front matter", "The world", "The story, yours only", "The characters"]);
    expect(w.findAll("button[data-part]").map((b) => b.attributes("data-part"))).toEqual(["premise", "world", "truths", "lore", "peoples", "life", "moving", "secrets", "backstories"]);
  });

  // Bug caught: a zero shown as a count, or a count on a chapter that holds no entries.
  it("shows a count only where a chapter counts entries and holds some", () => {
    const w = mountContents({ truths: 4, world: 9, lore: 0 });
    expect(w.get("[data-testid=count-truths]").text()).toBe("4");
    expect(w.find("[data-testid=count-lore]").exists()).toBe(false);
    expect(w.find("[data-testid=count-world]").exists()).toBe(false);
  });

  it("marks the active chapter and selects the one chosen", async () => {
    const w = mountContents({}, "lore");
    expect(w.get("button[data-part=lore]").attributes("aria-current")).toBe("true");
    expect(w.get("button[data-part=truths]").attributes("aria-current")).toBeUndefined();
    await w.get("button[data-part=moving]").trigger("click");
    expect(w.emitted("select")).toEqual([["moving"]]);
  });

  // Bug caught: the narrow picker listing no counts, or selecting the chapter that is already open (a navigation to nowhere).
  it("offers a Chapter picker with one option per chapter and its count, which selects a different chapter only", async () => {
    const w = mountContents({ truths: 3 }, "premise");
    const options = w.findAll("select option").map((o) => o.text());
    expect(options).toHaveLength(CANON_SECTIONS.length);
    expect(options).toContain("Truths · 3");
    expect(options).toContain("Lore");
    // The native select's own change handling is AppSelect's (and jsdom's selectedOptions does not follow a script); the picker's wiring is what is asserted.
    const picker = w.getComponent(AppSelect);
    picker.vm.$emit("update:modelValue", "premise");
    await w.vm.$nextTick();
    expect(w.emitted("select")).toBeUndefined();
    picker.vm.$emit("update:modelValue", "lore");
    await w.vm.$nextTick();
    expect(w.emitted("select")).toEqual([["lore"]]);
  });
});
