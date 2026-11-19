import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloFightRoster from "./SoloFightRoster.vue";
import type { SeenCombatant } from "@/lib/table/solo/fight/foeView";

const you: SeenCombatant = { instanceId: "pc", name: "Mira", isYou: true, side: "you", health: { kind: "numbers", hp: 46, maxHp: 58 } };
const goblin: SeenCombatant = { instanceId: "g1", name: "Goblin", isYou: false, side: "foe", health: { kind: "word", word: "Bloodied" } };
const roster = (over: Record<string, unknown> = {}) =>
  mount(SoloFightRoster, { props: { name: "Ambush", started: true, round: 2, seen: [you, goblin], activeInstanceId: "pc", ...over } });
const rowOf = (w: ReturnType<typeof roster>, name: string) => w.findAll("li").find((li) => li.text().startsWith(name))!;

describe("SoloFightRoster", () => {
  // Bug caught: a foe's numbers leaking into its row (the server hides them; the card must not invent any).
  it("shows a foe as its name and a word, nothing more", () => {
    const w = roster({ seen: [you, { ...goblin, health: { kind: "word", word: "Bloodied" } }] });
    expect(rowOf(w, "Goblin").text()).toBe("GoblinBloodied");
  });

  // Bug caught: the played character shown with a word, so the player cannot see their own hit points.
  it("shows the played character's own hit points as numbers", () => {
    expect(rowOf(roster(), "Mira").text()).toBe("Mira46 of 58");
  });

  // Bug caught: the active marker landing on the wrong row, or on none.
  it("marks only the row whose turn it is", () => {
    const w = roster({ activeInstanceId: "g1" });
    expect(rowOf(w, "Goblin").attributes("aria-current")).toBe("true");
    expect(rowOf(w, "Mira").attributes("aria-current")).toBeUndefined();
  });

  it("marks nobody before the fight has an active turn", () => {
    expect(roster({ activeInstanceId: null }).findAll('[aria-current="true"]')).toHaveLength(0);
  });

  // Bug caught: the heading and state line not changing when the fight begins (still "waiting on your initiative").
  it("reads as waiting before the fight and as a round once it runs", () => {
    const before = roster({ started: false, activeInstanceId: null });
    expect(before.text()).toContain("Who is in it");
    expect(before.text()).toContain("waiting on your initiative");
    expect(before.text()).not.toContain("Round");
    const during = roster({ started: true, round: 3 });
    expect(during.text()).toContain("Turn order");
    expect(during.text()).toContain("Round 3");
  });
});
