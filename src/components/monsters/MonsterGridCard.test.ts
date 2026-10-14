import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { sourceLabel } from "@/lib/library/sourceLabel";
import type { MonsterBrowseRow } from "@/types/monster.types";
import SourceBadge from "@/components/common/entity/SourceBadge.vue";
import MonsterGridCard from "./MonsterGridCard.vue";

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (s: string | null | undefined, t?: string | null) =>
      sourceLabel(s, t, new Map([["tome-of-beasts", "Tome of Beasts"]])),
  }),
}));

function row(over: Partial<MonsterBrowseRow>): MonsterBrowseRow {
  return {
    id: "m1",
    name: "Owlbear",
    size: "large",
    monster_type: "monstrosity",
    habitat: null,
    source: null,
    source_title: null,
    is_shared: false,
    tags: [],
    image_url: null,
    portrait_focal_point: null,
    challenge_rating: "3",
    armor_class: 13,
    hit_points: "59",
    ...over,
  };
}

function mountCard(monster: MonsterBrowseRow) {
  return mount(MonsterGridCard, {
    props: { monster },
    global: {
      stubs: {
        EntityGridCard: { template: "<div><slot name='body' /></div>" },
        MonsterRevealControl: true,
        AppButton: true,
      },
    },
  });
}

describe("MonsterGridCard source badge", () => {
  it("shows the source a DM typed on their own row", () => {
    const w = mountCard(row({ is_shared: false, source: "Monster Manual" }));
    expect(w.text()).toContain("Monster Manual");
  });

  it("shows a library row's book title", () => {
    const w = mountCard(row({ is_shared: true, source: "tome-of-beasts" }));
    expect(w.text()).toContain("Tome of Beasts");
  });

  it.each([null, "Grimoire:AI"])("shows no badge for source %s", (source) => {
    const w = mountCard(row({ source }));
    expect(w.findComponent(SourceBadge).text()).toBe("");
    expect(w.text()).not.toContain("Grimoire:AI");
  });
});
