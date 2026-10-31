// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RunnerPcAttackRow from "./RunnerPcAttackRow.vue";

const mountRow = (props: Record<string, unknown>) => mount(RunnerPcAttackRow, { props: { name: "Greataxe", attackBonus: 7, damageLabel: "1d12+4", ...props } });
const button = (w: ReturnType<typeof mountRow>, text: string) => w.findAll("button").find((b) => b.text().includes(text));

describe("RunnerPcAttackRow", () => {
  // #1125 frame 10: "Greataxe +7 · 1d12+4" with a small Roll.
  it("compact reads the name, bonus and damage on one line with a Roll", () => {
    const w = mountRow({ compact: true });
    expect(w.text()).toMatch(/Greataxe\s*\+7/);
    expect(w.text()).toContain("1d12+4");
    expect(button(w, "Roll")).toBeDefined();
  });

  it("Roll rolls the attack and the dice open the damage", async () => {
    const w = mountRow({ compact: true });
    await button(w, "Roll")?.trigger("click");
    expect(w.emitted("attack")).toHaveLength(1);
    await button(w, "1d12+4")?.trigger("click");
    expect(w.emitted("damage")).toHaveLength(1);
  });

  it("an attack with damage only rolls its damage on Roll", async () => {
    const w = mountRow({ compact: true, attackBonus: null });
    await button(w, "Roll")?.trigger("click");
    expect(w.emitted("attack")).toBeUndefined();
    expect(w.emitted("damage")).toHaveLength(1);
  });

  it("a blocked attack (no ammunition) cannot be rolled", async () => {
    const w = mountRow({ compact: true, attackDisabled: true });
    await button(w, "Roll")?.trigger("click");
    expect(w.emitted("attack")).toBeUndefined();
  });

  // The design system draws glyphs, never emoji, in buttons.
  it("carries no emoji in either layout", () => {
    for (const compact of [true, false]) {
      expect(mountRow({ compact }).text()).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
