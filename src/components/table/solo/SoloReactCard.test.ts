import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloReactCard from "./SoloReactCard.vue";
import type { CounterspellOffer, ReactionOffer, ShieldOffer } from "@/rules/fight/reactionOffer";

const names: Record<string, string> = { orc: "Orc", mage: "Mage" };
const nameOf = (id: string) => names[id] ?? id;
const shield: ShieldOffer = { kind: "shield", reactorId: "me", attackerId: "orc", attack: "Greataxe", roll: { natural: 14, total: 19 }, armorClass: 16, shieldedArmorClass: 21, spell: "Shield", castLevel: 1, spends: "slot" };
const counter: CounterspellOffer = { kind: "counterspell", reactorId: "me", casterId: "mage", spell: "Fireball", spellLevel: 3, counterSpell: "Counterspell", castLevel: 3, spends: "slot" };

const open: Array<{ unmount: () => void }> = [];
afterEach(() => open.splice(0).forEach((w) => w.unmount()));
function card(offer: ReactionOffer) {
  const w = mount(SoloReactCard, { props: { offer, nameOf }, attachTo: document.body });
  open.push(w);
  return w;
}
const button = (w: ReturnType<typeof card>, label: string) => w.findAll("button").find((b) => b.text().startsWith(label))!;
const press = (key: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key, code: key === " " ? "Space" : key, bubbles: true, cancelable: true }));

describe("SoloReactCard", () => {
  // Bug caught: the card quoting the wrong totals or the slot level, so the person chooses on numbers that are not the fight's.
  it("puts the hit, the armour classes and the slot in front of the person for a Shield", () => {
    const text = card(shield).text();
    expect(text).toContain("Orc's Greataxe hits you: 19 against your armour class 16");
    expect(text).toContain("Armour class 21 until your next turn. Spends a level 1 slot.");
  });

  // Bug caught: an innate spell's daily use, or an at-will cast, described as a spell slot the character would lose.
  it("names a daily use for an innate spell and no cost at will", () => {
    const innate = card({ ...shield, spends: "use" }).text();
    expect(innate).toContain("Spends one of its uses for the day.");
    expect(innate).not.toContain("slot");
    expect(card({ ...shield, spends: "free" }).text()).not.toMatch(/slot|uses for the day/);
  });

  // Bug caught: a Counterspell card describing a 2024 save as a spellcasting check (or the reverse), with the wrong DC.
  it("says the check for 2014 and the save for 2024", () => {
    expect(card({ ...counter, check: { dc: 13 } }).text()).toContain("You make a spellcasting check against DC 13.");
    const save = card({ ...counter, save: { dc: 15 } }).text();
    expect(save).toContain("Mage makes a Constitution save against DC 15.");
    expect(save).not.toContain("spellcasting check");
  });

  // Bug caught: Take the hit sending "cast" (the person loses a slot they declined to spend).
  it("answers pass for Take the hit and cast for Cast Shield", async () => {
    const a = card(shield);
    await button(a, "Take the hit").trigger("click");
    expect(a.emitted("answer")).toEqual([["pass"]]);
    const b = card(shield);
    await button(b, "Cast Shield").trigger("click");
    expect(b.emitted("answer")).toEqual([["cast"]]);
  });

  // Bug caught: a double click (or Space after a click) answering twice, replaying the paused turn a second time.
  it("sends one answer and turns its buttons off while it is being sent", async () => {
    const w = card(counter);
    await button(w, "Cast Counterspell").trigger("click");
    await w.vm.$nextTick();
    expect(w.findAll("button").every((b) => b.attributes("disabled") !== undefined)).toBe(true);
    press(" ");
    await w.vm.$nextTick();
    expect(w.emitted("answer")).toHaveLength(1);
  });

  // Bug caught: Space / Escape not reaching the card, so the keyboard player must use the mouse mid-fight.
  it("casts on Space and lets go on Escape", async () => {
    const a = card(shield);
    press(" ");
    expect(a.emitted("answer")).toEqual([["cast"]]);
    a.unmount();
    const b = card(shield);
    press("Escape");
    expect(b.emitted("answer")).toEqual([["pass"]]);
  });
});
