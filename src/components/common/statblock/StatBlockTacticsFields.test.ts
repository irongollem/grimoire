import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import StatBlockTacticsFields from "./StatBlockTacticsFields.vue";
import { emptyDefenses } from "@/types/statBlock.types";
import type { MonsterStatBlock, MonsterTactics } from "@/types/monster.types";

function block(over: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return {
    armor_class: 12, hit_points: "2d8", speed: "30 ft.",
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    challenge_rating: "1", defenses: emptyDefenses(), ...over,
  };
}

function mountFields(sb: MonsterStatBlock) {
  const live = reactive(sb);
  // The parent's half of the model: what the fields send is what the stat block holds.
  const w = mount(StatBlockTacticsFields, {
    props: {
      sb: live,
      creatureType: "humanoid",
      tactics: live.tactics,
      "onUpdate:tactics": (next: MonsterTactics | undefined) => {
        live.tactics = next;
        void w.setProps({ tactics: next });
      },
    },
  });
  return { live, w };
}

/** The select whose field label is `label`. */
function selectFor(w: ReturnType<typeof mountFields>["w"], label: string) {
  const found = w.findAll("label").find((l) => l.text().startsWith(label));
  if (!found) throw new Error(`no field ${label}`);
  return found.find("select");
}

describe("StatBlockTacticsFields", () => {
  it("writes the picked role, and going back to Automatic removes the key and the empty tactics object", async () => {
    const { live, w } = mountFields(block());
    await selectFor(w, "Role").setValue("lurker");
    expect(live.tactics).toEqual({ role: "lurker" });
    await selectFor(w, "Role").setValue("");
    expect(live.tactics).toBeUndefined();
  });

  it("keeps the other authored fields when one goes back to Automatic", async () => {
    const { live, w } = mountFields(block({ tactics: { role: "brute", cover: "ignores" } }));
    await selectFor(w, "Role").setValue("");
    expect(live.tactics).toEqual({ cover: "ignores" });
  });

  it("clearing the note removes it instead of storing an empty string", async () => {
    const { live, w } = mountFields(block({ tactics: { note: "Guards the door" } }));
    await w.find("input").setValue("");
    expect(live.tactics).toBeUndefined();
  });

  it("shows an off-preset morale as its own selected option and leaves it alone when another field changes", async () => {
    // oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field (#1203)
    const { live, w } = mountFields(block({ tactics: { morale: { breaksAt: 0.4, then: "flee" } } }));
    const morale = selectFor(w, "When it is losing");
    expect((morale.element as HTMLSelectElement).selectedOptions[0].text).toBe("Flees at 40% of its hit points");
    await selectFor(w, "Cover").setValue("fights_from");
    // oxlint-disable-next-line unicorn/no-thenable -- see above
    expect(live.tactics?.morale).toEqual({ breaksAt: 0.4, then: "flee" });
  });

  it("words the Automatic option from the stat block, not from the authored role", () => {
    const { w } = mountFields(block({ speed: "40 ft.", tactics: { role: "leader" } }));
    const first = selectFor(w, "Role").findAll("option")[0];
    expect(first.text()).toBe("Automatic: Skirmisher");
  });

  it("follows Intelligence live in the Automatic cover and the tier sentence", async () => {
    const { live, w } = mountFields(block({ int: 10 }));
    expect(selectFor(w, "Cover").findAll("option")[0].text()).toBe("Automatic: Takes it when it is cheap");
    expect(w.text()).toContain("it can also Dodge and Disengage.");
    live.int = 14;
    await w.vm.$nextTick();
    expect(selectFor(w, "Cover").findAll("option")[0].text()).toBe("Automatic: Fights from it");
    expect(w.text()).toContain("Dodge, Disengage and Hide");
  });
});
