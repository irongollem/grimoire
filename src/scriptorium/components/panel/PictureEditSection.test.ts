// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
import PictureEditSection from "./PictureEditSection.vue";
import type { TreatmentPatch } from "@/scriptorium/lib/panel/pictureTreatment";

const washed = { type: "wash", from: "bottom", reach: 0.3, brush: 0.1, dry: 0.9, seed: 11 };
const picture = (steps: unknown[] = []) => ({ src: "baked.webp", original: "orig.webp", illuminate: { v: 1, seed: 1, steps }, bakedFor: "old" });

function lastPatch(w: ReturnType<typeof mount>): TreatmentPatch {
  const all = w.emitted("patch");
  if (!all) throw new Error("no patch");
  return all.at(-1)![0] as TreatmentPatch;
}
const steps = (p: TreatmentPatch) => (p.illuminate as { steps: Record<string, unknown>[] }).steps;

describe("the paper wash in the picture panel", () => {
  // Fails on: turning the wash on not clearing bakedFor, so the old bake keeps showing and players keep seeing the unwashed picture.
  it("turning it on writes the wash with its defaults and clears the pending bake", async () => {
    const w = mount(PictureEditSection, { props: { values: picture() } });
    await w.get('[data-testid="wash-on"]').trigger("click");
    const patch = lastPatch(w);
    expect(patch.bakedFor).toBeNull();
    expect(steps(patch)).toMatchObject([{ type: "wash", from: "left", reach: 0.6, brush: 0.55, dry: 0.65 }]);
  });

  // Fails on: Paint it again changing the look settings too, so a retry loses what the writer set.
  it("paint it again changes only the seed", async () => {
    const w = mount(PictureEditSection, { props: { values: picture([washed]) } });
    await w.get('[data-testid="wash-repaint"]').trigger("click");
    const [step] = steps(lastPatch(w));
    expect({ ...step, seed: 0 }).toEqual({ ...washed, seed: 0 });
    expect(step.seed).not.toBe(11);
  });

  // Fails on: Remove leaving the step in the recipe, so the wash comes back on the next bake.
  it("remove drops the wash step", async () => {
    const w = mount(PictureEditSection, { props: { values: picture([washed, { type: "vignette", options: { strength: 0.5, softness: 0.5, mode: "transparent", colour: "#000000" } }]) } });
    await w.get('[data-testid="wash-remove"]').trigger("click");
    expect(steps(lastPatch(w)).map((s) => s.type)).toEqual(["vignette"]);
  });
});
