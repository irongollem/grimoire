import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonContents from "./CanonContents.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { CANON_SECTIONS, type CanonSectionId } from "@/lib/canon/canonParts";

const counts = (over: Partial<Record<CanonSectionId, number>> = {}) =>
  Object.fromEntries(CANON_SECTIONS.map((s) => [s.id, over[s.id] ?? 0])) as Record<CanonSectionId, number>;
const DeletedStub = { name: "CanonDeleted", template: "<div data-testid=\"canon-deleted\" />" };
const mountContents = (over: Partial<Record<CanonSectionId, number>> = {}, active: CanonSectionId = "premise") => mount(CanonContents, { props: { active, counts: counts(over) }, global: { stubs: { CanonDeleted: DeletedStub } } });

describe("CanonContents", () => {

  // Bug caught: a zero shown as a count, or a count on a chapter that holds no entries.
  it("shows a count only where a chapter counts entries and holds some", () => {
    const w = mountContents({ truths: 4, world: 9, lore: 0 });
    expect(w.get("[data-testid=count-truths]").text()).toBe("4");
    expect(w.find("[data-testid=count-lore]").exists()).toBe(false);
    expect(w.find("[data-testid=count-world]").exists()).toBe(false);
  });

  // Bug caught (#1279 item 34c): the Deleted list left under the chapters, so every sheet drew it; it belongs at the foot of the contents.
  it("holds the Deleted list after every chapter group", () => {
    const w = mountContents();
    const nav = w.get("[data-testid=canon-contents]");
    const deleted = nav.get("[data-testid=canon-deleted]");
    const lastGroup = [...nav.element.querySelectorAll("section[data-group]")].pop()!;
    expect(lastGroup.compareDocumentPosition(deleted.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Bug caught (#1279 item 26): one chapter under three names ("What is moving", "Moving", "Forces"; "Life" for the habitats).
  it("names the chapters Forces and Habitats, in the column and in the picker", () => {
    const w = mountContents();
    expect(w.get("button[data-part=moving]").text()).toBe("Forces");
    expect(w.get("button[data-part=life]").text()).toBe("Habitats");
    const options = w.findAll("select option").map((o) => o.text());
    expect(options).toContain("Forces");
    expect(options).toContain("Habitats");
    expect(options.join("|")).not.toMatch(/moving|Life/i);
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

describe("CanonContents (#1279 items 17 and 18)", () => {
  // Bug caught (item 17): the narrow picker a flat select, so the grouping that explains the book was lost below the column's width.
  it("groups the picker's chapters under the book's own group names", () => {
    const w = mountContents();
    const groups = w.findAll("select optgroup").map((g) => [g.attributes("label"), g.findAll("option").length]);
    expect(groups.map(([label]) => label)).toEqual(["Front matter", "The world", "The story, yours only", "The characters"]);
    expect(groups.reduce((n, [, c]) => n + (c as number), 0)).toBe(CANON_SECTIONS.length);
  });

  // Bug caught (item 18): counts narrowed to an arc with nothing on the contents saying so, and no way to clear it where the Arc control is hidden.
  it("shows the arc the counts are narrowed to, with a Clear that asks the page to widen", async () => {
    const w = mount(CanonContents, { props: { active: "premise", counts: counts(), arcLabel: "The Drowning" }, global: { stubs: { CanonDeleted: DeletedStub } } });
    expect(w.get("[data-testid=canon-arc-chip]").text()).toContain("The Drowning");
    await w.get("[data-testid=canon-arc-chip-clear]").trigger("click");
    expect(w.emitted("clearArc")).toHaveLength(1);
  });

  it("shows no chip when no arc is chosen", () => {
    expect(mountContents().find("[data-testid=canon-arc-chip]").exists()).toBe(false);
  });
});
