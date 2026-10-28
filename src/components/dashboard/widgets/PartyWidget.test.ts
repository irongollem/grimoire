import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyWidget from "./PartyWidget.vue";
import type { PartyMember } from "@/types/party.types";

/** Just the fields PartyWidget actually reads — see the identical convention
 *  in `src/lib/dashboard/deathSaves.test.ts`. */
function partyMember(overrides: Partial<PartyMember> & { id: string }): PartyMember {
  return {
    name: overrides.id,
    portrait_url: null,
    portrait_focal_point: null,
    current_hp: 10,
    max_hp: 10,
    ac: 15,
    wis: 10,
    proficiency_bonus: 2,
    skill_proficiencies: {},
    inspiration: false,
    conditions: [],
    curses: [],
    species_id: null,
    level: 1,
    class: null,
    ...overrides,
  } as PartyMember;
}

const mocks = vi.hoisted(() => ({
  cms: [] as Array<{ party_member_id: string; user_id: string }>,
  online: new Set<string>(),
  /** Mirrors what `useParty()` (a real TanStack useQuery result) hands back —
   *  undefined data is the disabled/in-flight case this bug was about. */
  partyData: undefined as PartyMember[] | undefined,
  partyIsError: false,
  refetch: vi.fn(),
}));

vi.mock("@/composables/party/useParty", () => ({
  // Real refs, not plain `{ value }` objects: PartyWidget's template reads
  // `party`/`partyIsError` directly, relying on <script setup>'s automatic
  // ref-unwrapping — a non-ref mock renders truthy-object nonsense instead.
  useParty: () => ({
    data: ref(mocks.partyData),
    isError: ref(mocks.partyIsError),
    refetch: mocks.refetch,
  }),
}));
// The surface reads the active party; here it is the same fixture as useParty.
vi.mock("@/composables/party/useActiveParty", async () => ({
  useActiveParty: (await import("@/composables/party/useParty")).useParty,
}));
vi.mock("@/composables/rules/useSpecies", () => ({ useSpeciesNames: () => () => null }));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: { value: new Map() } }) }));
vi.mock("@/composables/party/useArmorClass", () => ({
  useArmorClass: () => ({ acFor: () => 10, acBreakdownFor: () => ({ total: 10, parts: [{ label: "Base", value: 10 }], notes: [] }) }),
}));vi.mock("@/composables/party/useCharacterClasses", () => ({
  useAllCampaignCharacterClasses: () => ({ data: { value: [] } }),
}));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: { value: mocks.cms } }) }));
vi.mock("@/composables/campaign/useCampaignPresence", () => ({ useCampaignPresence: () => ({ isOnline: (u: string) => mocks.online.has(u) }) }));
const gates = vi.hoisted(() => ({ isDM: false, trackerEnabled: [] as Array<() => boolean>, rulesEnabled: [] as Array<() => boolean> }));
vi.mock("@/composables/dashboard/useTrackerState", () => ({
  useTrackerStates: (enabled: () => boolean) => gates.trackerEnabled.push(enabled),
}));
vi.mock("@/composables/rules/useRules", () => ({
  useRules: (enabled: () => boolean) => gates.rulesEnabled.push(enabled),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isDM() { return gates.isDM; } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: null }) }));

// AppButton renders a real RouterLink for every `to="..."` prop, which needs an
// injected router instance — stub it rather than standing up a router for a
// widget that never asserts on navigation.
const routerStub = { global: { stubs: { RouterLink: true } } };

describe("PartyWidget", () => {
  it("starts the tracker reads with the widget, for a DM only", () => {
    gates.trackerEnabled.length = 0;
    gates.rulesEnabled.length = 0;
    mount(PartyWidget, routerStub);
    expect(gates.trackerEnabled).toHaveLength(1);
    expect(gates.rulesEnabled).toHaveLength(1);
    gates.isDM = false;
    expect(gates.trackerEnabled[0]!()).toBe(false);
    expect(gates.rulesEnabled[0]!()).toBe(false);
    gates.isDM = true;
    expect(gates.trackerEnabled[0]!()).toBe(true);
    expect(gates.rulesEnabled[0]!()).toBe(true);
    gates.isDM = false;
  });

  beforeEach(() => {
    mocks.partyData = undefined;
    mocks.partyIsError = false;
    mocks.refetch.mockReset();
    mocks.cms = [];
    mocks.online = new Set();
  });

  it("shows the loading state, not the empty state, while the query has no answer yet (disabled or in-flight)", () => {
    mocks.partyData = undefined;
    mocks.partyIsError = false;
    const wrapper = mount(PartyWidget, routerStub);
    expect(wrapper.text()).not.toContain("No party members yet.");
    expect(wrapper.text()).not.toContain("could not be loaded");
    expect(wrapper.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
  });

  it("shows an error state with a working Retry control when the query fails", async () => {
    mocks.partyData = undefined;
    mocks.partyIsError = true;
    const wrapper = mount(PartyWidget, routerStub);
    expect(wrapper.text()).not.toContain("No party members yet.");
    expect(wrapper.text()).toContain("Party could not be loaded.");
    const retry = wrapper.findAll("button").find((b) => b.text() === "Retry");
    expect(retry).toBeTruthy();
    await retry!.trigger("click");
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state only once the query has actually succeeded with zero rows", () => {
    mocks.partyData = [];
    mocks.partyIsError = false;
    const wrapper = mount(PartyWidget, routerStub);
    expect(wrapper.text()).toContain("No party members yet.");
  });

  it("renders the party grid when the query succeeds with rows", () => {
    mocks.partyData = [partyMember({ id: "member-1", name: "Mira" })];
    mocks.partyIsError = false;
    const wrapper = mount(PartyWidget, {
      global: { stubs: { RouterLink: true, FocalImage: true, DmTrackerButtons: true } },
    });
    expect(wrapper.text()).not.toContain("No party members yet.");
    expect(wrapper.text()).toContain("Mira");
  });

  const mountParty = (members: PartyMember[]) => {
    mocks.partyData = members;
    return mount(PartyWidget, { global: { stubs: { RouterLink: true, FocalImage: true, DmTrackerButtons: true } } });
  };
  const hpSpan = (w: ReturnType<typeof mountParty>, hp: number) => w.findAll("span").find((s) => s.text() === String(hp) && s.classes().includes("font-bold"))!;

  // 5e "bloodied" is half hit points: at exactly half a character is already in the amber tier.
  it.each([
    [0, 10, "text-muted-foreground"],
    [2, 10, "text-destructive"],
    [1, 4, "text-destructive"], // exactly a quarter
    [3, 10, "text-ink-caution"],
    [5, 10, "text-ink-caution"], // exactly half
    [6, 10, "text-ink-success"],
  ])("%i of %i HP shows %s", (hp, max, cls) => {
    const w = mountParty([partyMember({ id: "m", current_hp: hp, max_hp: max })]);
    expect(hpSpan(w, hp).classes()).toContain(cls);
  });

  it("the HP bar turns amber at exactly half, like the number", () => {
    const w = mountParty([partyMember({ id: "m", current_hp: 5, max_hp: 10 })]);
    expect(w.find(".h-1\\.5 > div").classes()).toContain("bg-tone-caution");
  });

  it("lists conditions alone, curses alone, and nothing when neither", () => {
    const cond = mountParty([partyMember({ id: "a", conditions: [{ name: "Poisoned" }] as PartyMember["conditions"], curses: [] })]);
    expect(cond.text()).toContain("Poisoned");
    const curse = mountParty([partyMember({ id: "b", conditions: [], curses: ["Ash"] })]);
    expect(curse.text()).toContain("Cursed: Ash");
    const none = mountParty([partyMember({ id: "c" })]);
    expect(none.text()).not.toContain("Cursed");
  });

  it("marks a member online only when their campaign seat's user is present", () => {
    mocks.cms = [{ party_member_id: "a", user_id: "u1" }, { party_member_id: "b", user_id: "u2" }];
    mocks.online = new Set(["u1"]);
    const w = mountParty([partyMember({ id: "a" }), partyMember({ id: "b" }), partyMember({ id: "c" })]);
    const dots = w.findAll("span.rounded-full").filter((d) => d.classes().some((c) => c.startsWith("bg-tone-success") || c.startsWith("bg-muted-foreground/30")));
    expect(dots.map((d) => d.classes().includes("bg-tone-success"))).toEqual([true, false, false]);
  });
});
