import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import MonsterSheetMobile from "./MonsterSheetMobile.vue";
import type { Monster } from "@/types/monster.types";

/** #590: a co-DM reads the owner's personal library monsters but cannot edit them. */

const mocks = vi.hoisted(() => ({ userId: "me" }));

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: mocks.userId } }) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/monsters/useMonsters", () => ({
  useCloneLibraryMonster: () => ({ mutateAsync: vi.fn() }),
  useDeleteMonster: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/monsters/useMonsterDescription", () => ({ useMonsterDescription: () => ref("") }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: ref([]) }) }));
vi.mock("@/composables/monsters/useMonsterVisibility", () => ({ useMonsterVisibility: () => ({ isDiscovered: ref(false) }) }));

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
  EntitySheetMobile: {
    template: "<div><slot name='bottom-bar' /><slot name='menu' :close='() => {}' /><slot /></div>",
  },
  MonsterRevealControl: true,
  DmNoteBox: true,
  AccordionSection: true,
  QuickFact: true,
  CopyToCampaignDialog: true,
  PaywallModal: true,
  RouterLink: { template: "<a><slot /></a>" },
};

function labels(wrapper: ReturnType<typeof mount>) {
  return [...wrapper.findAll("button, a")].map((b) => b.text());
}

describe("MonsterSheetMobile read-only library rows", () => {
  beforeEach(() => {
    mocks.userId = "me";
  });

  it("offers Edit, Duplicate and Delete on the caller's own library monster", () => {
    const wrapper = mount(MonsterSheetMobile, { props: { monster: monster({ user_id: "me" }) }, global: { stubs } });
    const l = labels(wrapper);
    expect(l).toContain("Edit");
    expect(l).toContain("Duplicate");
    expect(l).toContain("Delete monster");
    expect(l).not.toContain("Copy to campaign…");
    expect(wrapper.find('[data-testid="read-only-library-note"]').exists()).toBe(false);
  });

  it("offers no write control on another DM's library monster, only Copy to campaign", () => {
    const wrapper = mount(MonsterSheetMobile, { props: { monster: monster({ user_id: "owner" }) }, global: { stubs } });
    const l = labels(wrapper);
    for (const write of ["Edit", "Duplicate", "Delete monster", "Send to Scriptorium", "Customize"]) {
      expect(l).not.toContain(write);
    }
    expect(l).toContain("Copy to campaign…");
    expect(wrapper.get('[data-testid="read-only-library-note"]').text()).toContain("Read only");
  });
});
