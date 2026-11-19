import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const dice = vi.hoisted(() => ({ faces: [] as number[] }));
vi.mock("@/lib/dice/dice", async (orig) => ({ ...(await orig<typeof import("@/lib/dice/dice")>()), rollDie: () => dice.faces.shift() ?? 1 }));

import SoloRollAsk from "./SoloRollAsk.vue";
import type { RollAsk } from "@/lib/table/solo/soloTypes";

const ask: RollAsk = { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception" };
const card = (over: Record<string, unknown> = {}) => mount(SoloRollAsk, { props: { ask, bonus: 4, ...over } });
const button = (w: ReturnType<typeof card>, label: string) => w.findAll("button").find((b) => b.text() === label)!;

beforeEach(() => {
  dice.faces = [];
});

describe("SoloRollAsk", () => {
  it("shows the check, its bonus and nothing about a number to beat", () => {
    const w = card();
    expect(w.text()).toContain("Wisdom (Perception)");
    expect(w.text()).toContain("d20 + 4");
    expect(w.text()).not.toMatch(/DC|beat/i);
  });

  // Bug caught: the on-screen roll emitting a different count of dice than the mode, which the server refuses.
  it("rolls one die on screen, two with advantage", async () => {
    dice.faces = [9];
    const w = card();
    await button(w, "Roll it here").trigger("click");
    expect(w.emitted("roll")![0]).toEqual([{ faces: [9], mode: "normal", bonus: 4, atTable: false }]);

    dice.faces = [9, 15];
    await button(w, "Advantage").trigger("click");
    await button(w, "Roll it here").trigger("click");
    expect(w.emitted("roll")![1]).toEqual([{ faces: [9, 15], mode: "advantage", bonus: 4, atTable: false }]);
  });

  // Bug caught: a typed face sent as a screen roll (the sheet then claims the page rolled it), or two faces for a typed roll.
  it("sends the face typed at the table as one face, marked at the table", async () => {
    const w = card();
    await w.get("input").setValue(13);
    await button(w, "Use my roll").trigger("click");
    expect(w.emitted("roll")![0]).toEqual([{ faces: [13], mode: "normal", bonus: 4, atTable: true }]);
  });

  // Bug caught: a face of 0 or 21 reaching the server because the button stayed live.
  it("does not accept a typed face outside 1 to 20", async () => {
    const w = card();
    for (const face of [0, 21]) {
      await w.get("input").setValue(face);
      expect(button(w, "Use my roll").attributes("disabled")).toBeDefined();
    }
    await w.get("input").setValue(20);
    expect(button(w, "Use my roll").attributes("disabled")).toBeUndefined();
  });

  // Bug caught: chosen advantage beating a condition's disadvantage, and the card not saying why it is not an advantage roll.
  it("says when a condition forces disadvantage, and cancels a chosen advantage against it", async () => {
    dice.faces = [9];
    const w = card({ forcedDisadvantage: true });
    expect(w.text()).toContain("Disadvantage from a condition");
    await button(w, "Advantage").trigger("click");
    await button(w, "Roll it here").trigger("click");
    expect(w.emitted("roll")![0]).toEqual([{ faces: [9], mode: "normal", bonus: 4, atTable: false }]);
  });

  // Bug caught: rolling on a bonus that is not known yet (class rows still loading), which the sheet would score otherwise.
  it("cannot roll until the bonus is known, or while a turn runs", () => {
    for (const over of [{ bonus: null }, { busy: true }]) {
      const w = card(over);
      expect(button(w, "Roll it here").attributes("disabled")).toBeDefined();
    }
  });
});
