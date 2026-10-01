import { mount } from "@vue/test-utils";
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

vi.mock("@/composables/party/useParty", () => ({
  useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }),
}));

const CAMPAIGN_ID = "c1";

// A condition whose rules text differs between editions, so the title proves which one was read.
const found = CONDITIONS.find(
  (name) => name !== "Exhaustion" && getConditionDescription(name, "2014") !== getConditionDescription(name, "2024"),
);
if (!found) throw new Error("No condition differs between editions; the test has nothing to tell them apart by");
const condition: string = found;

function member(ruleset: RulesetKey, campaignId: string | null): PartyMember {
  return { id: "m1", ruleset, campaign_id: campaignId, conditions: [condition], curses: [] } as unknown as PartyMember;
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
