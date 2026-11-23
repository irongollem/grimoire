import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonStart from "./CanonStart.vue";
import { CANON_SECTIONS, type CanonSectionId } from "@/lib/canon/canonParts";

const counts = (over: Partial<Record<CanonSectionId, number>> = {}) =>
  Object.fromEntries(CANON_SECTIONS.map((s) => [s.id, over[s.id] ?? 0])) as Record<CanonSectionId, number>;

describe("CanonStart", () => {
  // Bug caught: the strip lingering on a finished canon.
  it("renders nothing once all four steps are done", () => {
    const w = mount(CanonStart, { props: { counts: counts({ truths: 1, moving: 1, secrets: 1 }), hasPitch: true } });
    expect(w.find("[data-testid=canon-start]").exists()).toBe(false);
  });

  // Bug caught: a step's button jumping to the wrong part.
  it("emits the part of the step whose button is pressed", async () => {
    const w = mount(CanonStart, { props: { counts: counts(), hasPitch: false } });
    await w.get("[data-testid=start-truths] button").trigger("click");
    expect(w.emitted("go")).toEqual([["truths"]]);
  });

  // Bug caught: done shown by colour alone.
  it("says Done in words on a finished step and offers Open", () => {
    const w = mount(CanonStart, { props: { counts: counts(), hasPitch: true } });
    const step = w.get("[data-testid=start-premise]");
    expect(step.text()).toContain("Done");
    expect(step.get("button").text()).toBe("Open");
  });
});
