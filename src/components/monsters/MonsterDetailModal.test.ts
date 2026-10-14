import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import MonsterDetailModal from "./MonsterDetailModal.vue";
import type { Monster } from "@/types/monster.types";

/** #590: a co-DM reads the owner's personal library monsters but cannot edit them. */

const mocks = vi.hoisted(() => ({ userId: "me", monster: null as unknown }));

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: mocks.userId } }) }));
vi.mock("@/composables/monsters/useMonsters", () => ({
  useMonsterWithArt: () => ({ monster: ref(mocks.monster), isLoading: ref(false) }),
}));

function monster(overrides: Partial<Monster>): Monster {
  return {
    id: "m1",
    user_id: "me",
    campaign_id: null,
    name: "Owlbear",
    monster_type: "monstrosity",
    size: "large",
    alignment: "unaligned",
    habitat: null,
    source: null,
    tags: [],
    stat_block: { armor_class: 13, hit_points: "59", speed: "40 ft.", str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7, challenge_rating: "3" },
    is_shared: false,
    ...overrides,
  } as Monster;
}

const stubs = {
  EntityDetailModal: { template: "<div><slot name='actions' /><slot /></div>" },
  MonsterRevealControl: true,
  MonsterSheet: true,
  DmNoteBox: true,
  CopyToCampaignDialog: true,
  PaywallModal: true,
  RouterLink: { template: "<a><slot /></a>" },
};

function buttons(wrapper: ReturnType<typeof mount>) {
  return [...wrapper.findAll("button, a")].map((b) => b.text());
}

describe("MonsterDetailModal read-only library rows", () => {
  beforeEach(() => {
    mocks.userId = "me";
  });

  it("offers Edit and no caption on the caller's own library monster", () => {
    mocks.monster = monster({ user_id: "me" });
    const wrapper = mount(MonsterDetailModal, { props: { id: "m1" }, global: { stubs } });
    expect(buttons(wrapper)).toContain("Edit");
    expect(buttons(wrapper)).not.toContain("Copy to campaign…");
    expect(wrapper.find('[data-testid="read-only-library-note"]').exists()).toBe(false);
  });

  it("hides Edit and says why on another DM's library monster, keeping Copy to campaign", () => {
    mocks.monster = monster({ user_id: "owner" });
    const wrapper = mount(MonsterDetailModal, { props: { id: "m1" }, global: { stubs } });
    expect(buttons(wrapper)).not.toContain("Edit");
    expect(buttons(wrapper)).toContain("Copy to campaign…");
    expect(wrapper.get('[data-testid="read-only-library-note"]').text()).toContain("Read only");
  });

  it("keeps Edit on a campaign monster authored by someone else (campaign rows are shared)", () => {
    mocks.monster = monster({ user_id: "owner", campaign_id: "c1" });
    const wrapper = mount(MonsterDetailModal, { props: { id: "m1" }, global: { stubs } });
    expect(buttons(wrapper)).toContain("Edit");
  });
});
