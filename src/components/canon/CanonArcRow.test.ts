import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonArcRow from "./CanonArcRow.vue";
import type { CanonArc } from "@/composables/canon/useCanonArcs";

const arc = { id: "a1", name: "The drowned god", summary: "What the tide took", sort_order: 0 } as CanonArc;

function summaryField(w: ReturnType<typeof mount>) {
  return w.get('[aria-label="What the arc is about"]');
}

describe("CanonArcRow", () => {
  it("clears the line when the field is emptied", async () => {
    // Bug: emptying the optional line put the old words back, so an arc's line could never be removed.
    const w = mount(CanonArcRow, { props: { arc, first: true, last: true } });
    await summaryField(w).setValue("");
    expect(w.emitted("summarise")).toEqual([[null]]);
  });

  it("saves a changed line trimmed and leaves an unchanged one alone", async () => {
    // Bug: leaving the field untouched wrote the same line back on every blur.
    const w = mount(CanonArcRow, { props: { arc, first: true, last: true } });
    await summaryField(w).setValue("What the tide took");
    expect(w.emitted("summarise")).toBeUndefined();
    await summaryField(w).setValue("  The god under the bay  ");
    expect(w.emitted("summarise")).toEqual([["The god under the bay"]]);
  });
});
