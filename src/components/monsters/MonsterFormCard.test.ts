import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

// The registry answers by image URL; only URLs listed here have a record.
const registered = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  imageProvenanceKey: (url: string) => (url.startsWith("https://cdn.test/") ? { bucket: "b", stem: url } : null),
  loadImageProvenance: vi.fn(async (key: { stem: string }) =>
    registered.has(key.stem) ? { model: "gpt-image", generatedAt: "2026-09-01T10:00:00Z" } : null,
  ),
}));

function queryPlugin(): [typeof VueQueryPlugin, { queryClient: QueryClient }] {
  return [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }];
}
import MonsterFormCard from "./MonsterFormCard.vue";
import { buildAiProvenance } from "@/ai/provenance";
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
  // The double cast is the point of this file rather than a shortcut around
  // it: the fixture reproduces what `get_player_visible_monsters` actually
  // sends, and `Monster` says that shape cannot exist. A single `as Monster`
  // is rejected precisely because the types do not overlap — which is the bug
  // (#842) stated by the compiler.
  return {
    id: "m1",
    name: "Grell",
    size: "Medium",
    monster_type: "aberration",
    stat_block: statBlock,
  } as unknown as Monster;
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
    const revealed = { challenge_rating: "3", armor_class: 12, hit_points: "22" } as unknown as Monster["stat_block"];
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
        monster: monster({ challenge_rating: "1/4" } as unknown as Monster["stat_block"]),
        name: "Kobold",
        imageUrl: null,
        revealStats: true,
      },
    });
    expect(wrapper.text()).toContain("1/4");
    expect(wrapper.text()).not.toContain(CR_UNKNOWN);
  });

  it("badges a registered image even when the creature row has no ai_provenance", async () => {
    registered.clear();
    registered.add("https://cdn.test/grell.webp");
    const w = mount(MonsterFormCard, {
      props: { monster: monster(null), name: "Grell", imageUrl: "https://cdn.test/grell.webp" },
      global: { plugins: [queryPlugin()], stubs: { FocalImage: true } },
    });
    await flushPromises();
    expect(w.text()).toContain("AI");
  });

  it("shows no badge for an unregistered image even when the creature row has ai_provenance", async () => {
    registered.clear();
    const row = { ...monster(null), ai_provenance: buildAiProvenance("monster_generation", "openai", "gpt-image") };
    const w = mount(MonsterFormCard, {
      props: { monster: row, name: "Grell", imageUrl: "https://cdn.test/grell.webp" },
      global: { plugins: [queryPlugin()], stubs: { FocalImage: true } },
    });
    await flushPromises();
    expect(w.text()).not.toContain("AI");
  });

  it("does not badge the initial placeholder when there is no image", async () => {
    registered.clear();
    const w = mount(MonsterFormCard, {
      props: { monster: monster(null), name: "Grell", imageUrl: null },
      global: { plugins: [queryPlugin()] },
    });
    await flushPromises();
    expect(w.text()).not.toContain("AI");
  });
});
