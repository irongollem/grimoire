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
        EntityGridCard: { template: "<div><slot name='body' /><slot name='actions-start' /></div>" },
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

describe("MonsterGridCard facts and actions", () => {
  const editButton = (w: ReturnType<typeof mountCard>) => w.findAllComponents({ name: "AppButton" }).find((b) => b.props("tooltip") === "Edit monster");

  it("offers Edit on a monster the DM owns, and not on a library row, whose reveal control stays", () => {
    const own = mountCard(row({ is_shared: false }));
    expect(editButton(own)?.props("to")).toBe("/monsters/m1?edit=true");
    const shared = mountCard(row({ is_shared: true }));
    expect(editButton(shared)).toBeUndefined();
    expect(shared.findComponent({ name: "MonsterRevealControl" }).exists()).toBe(true);
  });

  it("states AC and hit points, spelling out the average of a bare dice formula, and CR", () => {
    const w = mountCard(row({ armor_class: 13, hit_points: "7d10+21", challenge_rating: "3" }));
    expect(w.text()).toContain("AC 13");
    expect(w.text()).toContain("HP 59 (7d10+21)");
    expect(w.text()).toContain("CR 3");
  });

  it("leaves AC out when there is none, and shows a dash for no hit points", () => {
    const w = mountCard(row({ armor_class: null, hit_points: null }));
    expect(w.text()).not.toContain("AC");
    expect(w.text()).toContain("HP —");
  });

  it("shows at most three tags", () => {
    const w = mountCard(row({ tags: ["a", "b", "c", "d"] }));
    expect(w.findAll(".bg-muted").map((t) => t.text())).toEqual(["a", "b", "c"]);
  });
});
