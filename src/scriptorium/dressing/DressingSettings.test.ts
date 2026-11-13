// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DressingSettings from "./DressingSettings.vue";
import type { Dressing } from "./dressing";

const ON: Dressing = {
  v: 1,
  seed: 11,
  stain: { on: true, strength: 0.6 },
  wash: { on: false, strength: 0.5 },
  corners: { on: false, strength: 0.8 },
};

const mountIt = (modelValue: Dressing | null) => mount(DressingSettings, { props: { modelValue } });
const row = (w: ReturnType<typeof mountIt>, label: string) => w.findAll("label").find((l) => l.text() === label)!.get("input");
const last = (w: ReturnType<typeof mountIt>) => (w.emitted("update:modelValue") as [Dressing | null][]).at(-1)![0];

describe("DressingSettings", () => {
  it("ticking the first part makes a dressing with just that part on, at its starting strength", async () => {
    // Fails on: a first tick that switches everything on, or one that writes nothing because there is no value yet.
    const w = mountIt(null);
    await row(w, "Wash along the edge").setValue(true);
    const made = last(w)!;
    expect(made.wash).toEqual({ on: true, strength: 0.5 });
    expect(made.stain.on).toBe(false);
    expect(made.corners.on).toBe(false);
    expect(Number.isSafeInteger(made.seed)).toBe(true);
  });

  it("unticking the last part empties the column", async () => {
    // Fails on: a book with every part off still storing a dressing, which then differs from a book with none.
    const w = mountIt(ON);
    await row(w, "Stain low on the page").setValue(false);
    expect(last(w)).toBeNull();
  });

  it("shows a strength only for a part that is on, and writes it as 0 to 1", async () => {
    const w = mountIt(ON);
    expect(w.findAll('input[type="range"]')).toHaveLength(1);
    await w.get('input[type="range"]').setValue("30");
    expect(last(w)!.stain).toEqual({ on: true, strength: 0.3 });
  });

  it("Shuffle picks a new seed and keeps every choice; with no dressing there is nothing to shuffle", async () => {
    // Fails on: Shuffle resetting the parts (the author loses what they set) or not moving the marks.
    const w = mountIt(ON);
    await w.get("button").trigger("click");
    const shuffled = last(w)!;
    expect(shuffled.seed).not.toBe(ON.seed);
    expect({ ...shuffled, seed: 0 }).toEqual({ ...ON, seed: 0 });
    expect(mountIt(null).get("button").attributes("disabled")).toBeDefined();
  });
});
