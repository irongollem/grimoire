import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloDeathSave from "./SoloDeathSave.vue";

const mountIt = (props: { busy?: boolean } = {}) => mount(SoloDeathSave, { props: { round: 3, successes: 1, failures: 2, ...props } });
const button = (w: ReturnType<typeof mountIt>, text: string) => w.findAll("button").find((b) => b.text() === text)!;

describe("SoloDeathSave", () => {
  // Bug caught: a die rolled at the table not marked as the player's own, or sent as a different number.
  it("takes the face the player typed, as rolled at the table", async () => {
    const w = mountIt();
    await w.get('input[type="number"]').setValue(14);
    await button(w, "Use my roll").trigger("click");
    expect(w.emitted("rolled")).toEqual([[14, true]]);
  });

  // Bug caught: a typed 0 or 21 deciding whether a character lives.
  it.each([0, 21, 9.5])("does not take %s for a d20", async (face) => {
    const w = mountIt();
    await w.get('input[type="number"]').setValue(face);
    await button(w, "Use my roll").trigger("click");
    await w.get('input[type="number"]').trigger("keydown.enter");
    expect(w.emitted("rolled")).toBeUndefined();
  });

  it("rolls a d20 on screen, not marked as rolled at the table", async () => {
    const w = mountIt();
    await button(w, "Roll it here").trigger("click");
    const [[face, atTable]] = w.emitted("rolled") as [number, boolean][];
    expect(face).toBeGreaterThanOrEqual(1);
    expect(face).toBeLessThanOrEqual(20);
    expect(atTable).toBe(false);
  });

  // Bug caught: a second save rolled while the first is still being written, costing two failures for one turn.
  it("takes no roll while one is being applied", async () => {
    const w = mountIt({ busy: true });
    await button(w, "Roll it here").trigger("click");
    expect(w.emitted("rolled")).toBeUndefined();
  });
});
