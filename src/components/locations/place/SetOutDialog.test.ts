import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { Journey } from "@/lib/travel/journey";
import SetOutDialog from "./SetOutDialog.vue";

const mocks = vi.hoisted(() => ({ setOut: vi.fn(), rule: { value: false } }));

const member = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, ruleset: "2014", con: 10, wis: 10, proficiency_bonus: 2, skill_proficiencies: {}, conditions: [], days_without_food: 0, str: 10, dex: 10, int: 10, cha: 10, ...over,
});
const row = (id: string, carriedBy: string | null, quantity: number) => ({ id, name: "Rations (1 day)", quantity, carried_by: carriedBy, quality: "standard" });

vi.mock("@/composables/locations/useSetOut", () => ({ useSetOut: () => ({ setOut: mocks.setOut }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([member("wren", "Wren"), member("dorn", "Dorn"), member("elsewhere", "Mira")]) }) }));
vi.mock("@/composables/items/usePartyInventory", () => ({ usePartyInventory: () => ({ data: ref([row("r1", "wren", 1), row("r2", null, 1)]) }) }));
vi.mock("@/composables/party/useCharacterClasses", () => ({ useAllCampaignCharacterClasses: () => ({ data: ref([]) }) }));
vi.mock("@/composables/rules/useOptionalRules", async () => {
  const { computed } = await import("vue");
  return { useIsRuleEnabled: () => computed(() => mocks.rule.value) };
});
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: (_y: number, _m: number, d: number) => `day ${d}` } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ todayYear: 1, todayMonth: 1, todayDay: 10 }) }));
vi.mock("@/lib/calendar/dayMath", () => ({ addDays: (_a: unknown, from: { day: number }, n: number) => ({ ...from, day: from.day + n }) }));
vi.mock("@/components/common/overlays/AppModal.vue", () => ({ default: { props: ["open"], template: "<div v-if='open'><slot /></div>" } }));

const journey = (days: number, paceId = "normal") =>
  ({ summary: { distance: 30, unit: "mi", paceId, time: { days, hours: 0, calendarDays: days }, from: null, to: null } }) as unknown as Journey;

function dialog(days = 3, paceId = "normal") {
  return mount(SetOutDialog, {
    props: { open: true, destination: { id: "far", name: "Daggerford" }, journey: journey(days, paceId), paceLabel: "normal", wayName: null, travellerIds: ["wren", "dorn"], movesParty: true, description: "words" },
  });
}

beforeEach(() => {
  mocks.setOut.mockReset().mockResolvedValue(undefined);
  mocks.rule.value = false;
});

describe("SetOutDialog", () => {
  it("with the rations rule off shows no food and plans none", async () => {
    const w = dialog();
    await w.get("[data-testid=set-out-confirm]").trigger("click");
    await flushPromises();
    expect(w.find("[data-testid=set-out-provisions]").exists()).toBe(false);
    expect(mocks.setOut.mock.calls[0][0].provisions).toBeNull();
  });

  it("lists only the members standing where the journey starts, and states the arrival day", () => {
    const w = dialog();
    expect(w.text()).toContain("Wren");
    expect(w.text()).not.toContain("Mira");
    expect(w.get("[data-testid=set-out-summary]").text()).toContain("They arrive on day 13");
  });

  it("an unticked traveller is left behind", async () => {
    const w = dialog();
    await w.findAll("input[type=checkbox]")[1].setValue(false);
    await w.get("[data-testid=set-out-confirm]").trigger("click");
    await flushPromises();
    expect(mocks.setOut.mock.calls[0][0].travellers.map((t: { id: string }) => t.id)).toEqual(["wren"]);
  });

  // Bug caught: the travellers known only after the dialog opened (the party still loading) all left unticked, so
  // "Set out" is greyed out and the DM must tick everyone by hand.
  it("ticks the travellers who arrive after the dialog opened", async () => {
    const w = mount(SetOutDialog, {
      props: { open: true, destination: { id: "far", name: "Daggerford" }, journey: journey(3), paceLabel: "normal", wayName: null, travellerIds: [], movesParty: true, description: "words" },
    });
    await w.setProps({ travellerIds: ["wren", "dorn"] });
    await w.get("[data-testid=set-out-confirm]").trigger("click");
    await flushPromises();
    expect(mocks.setOut.mock.calls[0][0].travellers.map((t: { id: string }) => t.id)).toEqual(["wren", "dorn"]);
  });

  it("with the rule on says who eats from where and who goes without, by name", () => {
    mocks.rule.value = true;
    // 3 days, Con 10 (2014: 3 free days). Wren has 1 ration, the stash 1: Wren eats the pack, Dorn the stash, then 2 hungry days each.
    const w = dialog(3);
    expect(w.get("[data-testid=set-out-food-wren]").text()).toContain("1 day from the pack");
    expect(w.get("[data-testid=set-out-food-wren]").text()).toContain("goes without for 2 days");
    expect(w.get("[data-testid=set-out-food-dorn]").text()).toContain("1 day from the stash");
  });

  it("offers foraging only at a slow pace", () => {
    mocks.rule.value = true;
    expect(dialog(3, "normal").text()).not.toContain("Forage on the way");
    expect(dialog(3, "slow").text()).toContain("Forage on the way");
  });

  it("shows a failure inline and stays open", async () => {
    mocks.setOut.mockRejectedValue(new Error("the date would not move"));
    const w = dialog();
    await w.get("[data-testid=set-out-confirm]").trigger("click");
    await flushPromises();
    expect(w.get("[data-testid=set-out-error]").text()).toBe("the date would not move");
    expect(w.emitted("close")).toBeUndefined();
  });

  it("closes after a successful set out", async () => {
    const w = dialog();
    await w.get("[data-testid=set-out-confirm]").trigger("click");
    await flushPromises();
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("cannot set out with nobody going", async () => {
    const w = dialog();
    const boxes = w.findAll("input[type=checkbox]");
    await boxes[0].setValue(false);
    await boxes[1].setValue(false);
    expect(w.get("[data-testid=set-out-confirm]").attributes("disabled")).toBeDefined();
  });

  it("at a slow pace, ticking Forage shows each day's rolls before anything is confirmed", async () => {
    mocks.rule.value = true;
    const w = dialog(2, "slow");
    const forage = w.findAll("input[type=checkbox]").find((b) => b.element.parentElement?.textContent?.includes("Forage on the way"));
    await forage!.setValue(true);
    expect(w.get("[data-testid=set-out-forage-rolls]").findAll("li")).toHaveLength(4); // 2 days x 2 foragers
    expect(mocks.setOut).not.toHaveBeenCalled();
  });
});
