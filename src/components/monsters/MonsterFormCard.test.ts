import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MonsterFormCard from "./MonsterFormCard.vue";
import type { Monster } from "@/types/monster.types";

/**
 * The card renders for players as well as DMs, and the player projection
 * (`get_player_visible_monsters`) returns `stat_block` as **null** whenever the
 * DM has not revealed a creature's stats — the gate is `reveal_stats`.
 *
 * `Monster.stat_block` is typed non-nullable, which is true of a row in
 * `monsters` (the column is NOT NULL) and false of what a player receives. That
 * mismatch is why this crashed in production rather than failing to compile:
 * three users hit `null is not an object (evaluating
 * 'e.monster.stat_block.challenge_rating')` opening an unrevealed creature.
 */
function monster(statBlock: Monster["stat_block"] | null): Monster {
  return {
    id: "m1",
    name: "Grell",
    size: "Medium",
    monster_type: "aberration",
    // The cast is the point of this file: it reproduces what the player
    // projection actually sends, which the type says cannot happen.
    stat_block: statBlock as Monster["stat_block"],
  } as Monster;
}

const CR_UNKNOWN = "???";

describe("MonsterFormCard", () => {
  it("renders a creature whose stats the DM has withheld, instead of crashing", () => {
    const wrapper = mount(MonsterFormCard, {
      props: { monster: monster(null), name: "Grell", imageUrl: null, revealStats: false },
    });
    expect(wrapper.text()).toContain("Grell");
    expect(wrapper.text()).toContain(CR_UNKNOWN);
  });

  it("withholds AC and HP until the DM reveals the stats", () => {
    const revealed = { challenge_rating: "3", armor_class: 12, hit_points: "22" } as Monster["stat_block"];
    const hidden = mount(MonsterFormCard, {
      props: { monster: monster(null), name: "Grell", imageUrl: null, revealStats: false },
    });
    expect(hidden.text()).not.toContain("AC");
    expect(hidden.text()).not.toContain("HP");

    const shown = mount(MonsterFormCard, {
      props: { monster: monster(revealed), name: "Grell", imageUrl: null, revealStats: true },
    });
    expect(shown.text()).toContain("AC");
    expect(shown.text()).toContain("12");
  });

  it("shows the real challenge rating once it has one", () => {
    const wrapper = mount(MonsterFormCard, {
      props: {
        monster: monster({ challenge_rating: "1/4" } as Monster["stat_block"]),
        name: "Kobold",
        imageUrl: null,
        revealStats: true,
      },
    });
    expect(wrapper.text()).toContain("1/4");
    expect(wrapper.text()).not.toContain(CR_UNKNOWN);
  });
});
