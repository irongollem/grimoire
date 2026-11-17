import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloInitiative from "./SoloInitiative.vue";

const mountIt = (props: { modifier: number; busy?: boolean }) =>
  mount(SoloInitiative, { props: { open: true, name: "Rosie", ...props }, global: { stubs: { teleport: true } }, attachTo: document.body });

const use = (w: ReturnType<typeof mountIt>) => w.findAll("button").find((b) => b.text() === "Use my roll")!;

describe("SoloInitiative", () => {
  // Bug caught: a die rolled at the table counted without the character's bonus, or with it added twice.
  it("adds the character's modifier to the face the player typed", async () => {
    const w = mountIt({ modifier: 4 });
    await w.get('input[type="number"]').setValue(13);
    await use(w).trigger("click");
    expect(w.emitted("rolled")).toEqual([[17]]);
    w.unmount();
  });

  // Bug caught: a typed 25 (or nothing at all) starting the fight with an impossible initiative.
  it.each([0, 21, 7.5])("does not take %s for a d20", async (face) => {
    const w = mountIt({ modifier: 4 });
    await w.get('input[type="number"]').setValue(face);
    await use(w).trigger("click");
    await w.get('input[type="number"]').trigger("keydown.enter");
    expect(w.emitted("rolled")).toBeUndefined();
    w.unmount();
  });

  it("rolls a d20 plus the modifier on screen", async () => {
    const w = mountIt({ modifier: -1 });
    await w.findAll("button").find((b) => b.text() === "Roll it here")!.trigger("click");
    const [[total]] = w.emitted("rolled") as number[][];
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(19);
    w.unmount();
  });

  // Bug caught: a second press while the first roll is being applied sending two initiatives.
  it("takes no roll while one is being applied", async () => {
    const w = mountIt({ modifier: 4, busy: true });
    await w.findAll("button").find((b) => b.text() === "Roll it here")!.trigger("click");
    expect(w.emitted("rolled")).toBeUndefined();
    w.unmount();
  });
});
