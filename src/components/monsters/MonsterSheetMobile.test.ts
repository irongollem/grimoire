import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sourceLabel } from "@/lib/library/sourceLabel";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import MonsterSheetMobile from "./MonsterSheetMobile.vue";
import type { Monster } from "@/types/monster.types";

/** #590: a co-DM reads the owner's personal library monsters but cannot edit them. */

const mocks = vi.hoisted(() => ({ userId: "me", push: vi.fn(), replace: vi.fn(), clone: vi.fn(), del: vi.fn() }));

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, new Map()),
  }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: mocks.userId } }) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/monsters/useMonsters", () => ({
  useCloneLibraryMonster: () => ({ mutateAsync: mocks.clone }),
  useDeleteMonster: () => ({ mutateAsync: mocks.del }),
}));
vi.mock("@/composables/monsters/useMonsterDescription", () => ({ useMonsterDescription: () => ref("") }));
const lairOptions = ref<{ id: string; name: string }[]>([]);
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: lairOptions }) }));
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
    template: "<div><slot name='after-facts' /><slot name='bottom-bar' /><slot name='menu' :close='() => {}' /><slot /></div>",
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

describe("MonsterSheetMobile actions", () => {
  const press = async (wrapper: ReturnType<typeof mount>, label: string) => {
    await [...wrapper.findAll("button, a")].find((b) => b.text() === label)!.trigger("click");
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    mocks.userId = "me";
    for (const m of [mocks.push, mocks.replace, mocks.clone, mocks.del]) m.mockReset();
    lairOptions.value = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes only after the browser's confirm says yes, then returns to the list", async () => {
    const confirmFn = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmFn);
    const wrapper = mount(MonsterSheetMobile, { props: { monster: monster({ user_id: "me" }) }, global: { stubs } });
    await press(wrapper, "Delete monster");
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();

    await press(wrapper, "Delete monster");
    expect(confirmFn.mock.calls[1]![0]).toContain("Owlbear");
    expect(mocks.del).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/monsters");
  });

  it("customizes a library monster into an editable copy and replaces the page with it", async () => {
    mocks.clone.mockResolvedValue({ id: "copy-1" });
    const wrapper = mount(MonsterSheetMobile, { props: { monster: monster({ user_id: "me", is_shared: true }) }, global: { stubs } });
    await press(wrapper, "Customize");
    expect(mocks.clone).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/monsters/copy-1");
  });

  it("offers Customize on a library monster, and Edit on the DM's own, never both", () => {
    const library = labels(mount(MonsterSheetMobile, { props: { monster: monster({ user_id: "me", is_shared: true }) }, global: { stubs } }));
    expect(library).toContain("Customize");
    expect(library).not.toContain("Delete monster");
    const own = labels(mount(MonsterSheetMobile, { props: { monster: monster({ user_id: "me", is_shared: false }) }, global: { stubs } }));
    expect(own).toContain("Edit");
    expect(own).not.toContain("Customize");
  });

  it("links the lair only when it is a place in this campaign's tree", () => {
    lairOptions.value = [{ id: "cave", name: "Stonejaw Cave" }];
    const found = mount(MonsterSheetMobile, { props: { monster: monster({ lair_location_id: "cave" }) }, global: { stubs } });
    expect(found.text()).toContain("Lair: Stonejaw Cave");
    const elsewhere = mount(MonsterSheetMobile, { props: { monster: monster({ lair_location_id: "gone" }) }, global: { stubs } });
    expect(elsewhere.text()).not.toContain("Lair:");
  });
});
