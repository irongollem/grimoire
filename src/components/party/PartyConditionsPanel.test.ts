import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import PartyConditionsPanel from "./PartyConditionsPanel.vue";
import { provideCharacterRuleset, useRuleset } from "@/composables/rules/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import { CONDITIONS, getConditionDescription } from "@/rules/conditions";
import type { Campaign } from "@/types/campaign.types";
import type { PartyMember } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";

const update = vi.hoisted(() => vi.fn());
vi.mock("@/composables/party/useParty", () => ({
  useUpdatePartyMember: () => ({ mutateAsync: update }),
}));

const CAMPAIGN_ID = "c1";

// A condition whose rules text differs between editions, so the title proves which one was read.
const found = CONDITIONS.find(
  (name) => name !== "Exhaustion" && getConditionDescription(name, "2014") !== getConditionDescription(name, "2024"),
);
if (!found) throw new Error("No condition differs between editions; the test has nothing to tell them apart by");
const condition: string = found;

function member(ruleset: RulesetKey, campaignId: string | null): PartyMember {
  return { id: "m1", ruleset, campaign_id: campaignId, conditions: [{ name: condition }], curses: [] } as unknown as PartyMember;
}

function seatCampaign(ruleset: RulesetKey) {
  const store = useCampaignStore();
  store.activeCampaignId = CAMPAIGN_ID;
  store.activeCampaign = { id: CAMPAIGN_ID, ruleset } as Campaign;
}

/** What PartyTrackerRow does: scope the character, then render what is under it. */
function Row(m: PartyMember, onBuild: (edition: RulesetKey) => void) {
  return defineComponent({
    setup() {
      provideCharacterRuleset(() => m);
      const { ruleset } = useRuleset();
      onBuild(ruleset.value);
      return () => h(PartyConditionsPanel, { member: m });
    },
  });
}

describe("character ruleset scope on a party row", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("reads build rules from the character and condition text from the table", () => {
    // A 2024 hero seated at a 2014 table: the build is 2024, the conditions are the table's 2014.
    seatCampaign("2014");
    let build: RulesetKey | null = null;
    const wrapper = mount(Row(member("2024", CAMPAIGN_ID), (e) => (build = e)), {
      global: { stubs: { ExhaustionChip: true } },
    });

    expect(build).toBe("2024");
    expect(wrapper.find(`[title="${getConditionDescription(condition, "2014")}"]`).exists()).toBe(true);
    expect(wrapper.find(`[title="${getConditionDescription(condition, "2024")}"]`).exists()).toBe(false);
  });

  it("reads conditions from the character's own edition when it has no table", () => {
    seatCampaign("2014");
    const wrapper = mount(Row(member("2024", null), () => undefined), {
      global: { stubs: { ExhaustionChip: true } },
    });

    expect(wrapper.find(`[title="${getConditionDescription(condition, "2024")}"]`).exists()).toBe(true);
  });
});

describe("PartyConditionsPanel edits", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    update.mockReset();
    update.mockResolvedValue(undefined);
    document.body.innerHTML = "";
  });

  function panel(over: Partial<PartyMember>) {
    const m = { id: "m1", ruleset: "2014", campaign_id: null, conditions: [], curses: [], ...over } as unknown as PartyMember;
    return mount(PartyConditionsPanel, { props: { member: m }, attachTo: document.body, global: { stubs: { ExhaustionChip: true } } });
  }
  const button = (w: ReturnType<typeof panel>, label: string) => w.findAll("button").find((b) => b.text() === label)!;
  const menuLabels = () => [...document.querySelectorAll("[role=dialog] button")].map((b) => b.textContent?.trim());

  async function openCurseInput(w: ReturnType<typeof panel>) {
    await w.find("[aria-haspopup=dialog]").trigger("click");
    (([...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent?.trim() === "Cursed…")) as HTMLElement).click();
    await flushPromises();
  }

  it("removing one condition writes the list without it and keeps the others", async () => {
    const w = panel({ conditions: [{ name: "Poisoned" }, { name: "Prone" }] } as Partial<PartyMember>);
    await w.findAll("button").filter((b) => b.text() === "×")[0].trigger("click");
    expect(update).toHaveBeenCalledWith({ id: "m1", update: { conditions: [{ name: "Prone" }] } });
  });

  it("trims a curse name, appends it, and marks the character Cursed", async () => {
    const w = panel({ curses: ["Wolf's hunger"] });
    await openCurseInput(w);
    await w.find("input").setValue("  Mark of Ash  ");
    await button(w, "Add").trigger("click");
    await flushPromises();
    const { curses, conditions } = update.mock.calls[0][0].update;
    expect(curses).toEqual(["Wolf's hunger", "Mark of Ash"]);
    expect(conditions).toEqual([{ name: "Cursed" }]);
  });

  it("does not stack a second Cursed condition on an already-cursed character", async () => {
    const w = panel({ curses: ["A"], conditions: [{ name: "Cursed" }] } as Partial<PartyMember>);
    await openCurseInput(w);
    await w.find("input").setValue("B");
    await button(w, "Add").trigger("click");
    await flushPromises();
    expect(update.mock.calls[0][0].update.conditions).toEqual([{ name: "Cursed" }]);
  });

  it("closes the curse box without writing when the name is blank", async () => {
    const w = panel({});
    await openCurseInput(w);
    await w.find("input").setValue("   ");
    await button(w, "Add").trigger("click");
    await flushPromises();
    expect(update).not.toHaveBeenCalled();
    expect(w.find("input").exists()).toBe(false);
  });

  it("lifts Cursed only when the last curse is removed", async () => {
    const two = panel({ curses: ["A", "B"], conditions: [{ name: "Cursed" }] } as Partial<PartyMember>);
    await two.findAll("button").filter((b) => b.text() === "×").slice(-2)[0].trigger("click");
    expect(update.mock.calls[0][0].update).toEqual({ curses: ["B"], conditions: [{ name: "Cursed" }] });

    update.mockClear();
    const one = panel({ curses: ["A"], conditions: [{ name: "Cursed" }] } as Partial<PartyMember>);
    await one.findAll("button").filter((b) => b.text() === "×").slice(-1)[0].trigger("click");
    expect(update.mock.calls[0][0].update).toEqual({ curses: [], conditions: [] });
  });

  it("offers Exhaustion only while the character has none, and never a condition already applied", async () => {
    const fresh = panel({ conditions: [{ name: "Poisoned" }] } as Partial<PartyMember>);
    await fresh.find("[aria-haspopup=dialog]").trigger("click");
    expect(menuLabels()).toContain("Exhaustion");
    expect(menuLabels()).not.toContain("Poisoned");
    fresh.unmount();
    document.body.innerHTML = "";

    const tired = panel({ conditions: [{ name: "Exhaustion", level: 2 }] } as unknown as Partial<PartyMember>);
    await tired.find("[aria-haspopup=dialog]").trigger("click");
    expect(menuLabels()).not.toContain("Exhaustion");
  });
});
