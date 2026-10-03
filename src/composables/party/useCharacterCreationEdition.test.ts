import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { useContentScope } from "@/composables/rules/useRuleset";
import { useCharacterCreationEdition } from "./useCharacterCreationEdition";

function setCampaign(ruleset: RulesetKey | null) {
  const store = useCampaignStore();
  store.activeCampaignId = ruleset ? "campaign-1" : null;
  store.activeCampaign = ruleset
    ? ({ id: "campaign-1", name: "Strahd", ruleset, allows_mixed_rulesets: false } as Campaign)
    : null;
}

/** Mounts a host that runs the composable in its own setup and hands back what it returned. */
function host(member: { value: boolean }, isDmCreate = false) {
  const reset = vi.fn();
  let result!: ReturnType<typeof useCharacterCreationEdition>;
  mount(defineComponent({
    setup() {
      result = useCharacterCreationEdition({
        isEditMode: false,
        isDmCreate,
        existingMember: null,
        isMemberOfActiveCampaign: () => member.value,
      });
      result.onEditionChange(reset);
      return () => h("i");
    },
  }));
  return { result, reset };
}

describe("useCharacterCreationEdition", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("seeds the edition from the table the character will land at", () => {
    setCampaign("2024");
    const { result } = host(ref(true));
    expect(result.landingCampaign.value?.id).toBe("campaign-1");
    expect(result.chosenRuleset.value).toBe("2024");
  });

  it("has no edition and no table when the creator sits nowhere", () => {
    setCampaign("2024");
    const { result } = host(ref(false));
    expect(result.landingCampaign.value).toBeNull();
    expect(result.chosenRuleset.value).toBeNull();
  });

  it("seeds late, when the membership loads after setup", async () => {
    setCampaign("2014");
    const member = ref(false);
    const { result } = host(member);
    expect(result.chosenRuleset.value).toBeNull();
    member.value = true;
    await Promise.resolve();
    expect(result.chosenRuleset.value).toBe("2014");
  });

  it("never overwrites a choice with the seed", async () => {
    setCampaign("2014");
    const member = ref(false);
    const { result } = host(member);
    result.chooseRuleset("2024");
    member.value = true;
    await Promise.resolve();
    expect(result.chosenRuleset.value).toBe("2024");
  });

  it("fires the reset only when the edition changes to a different non-null value", () => {
    setCampaign(null);
    const { result, reset } = host(ref(false));
    result.chooseRuleset("2014");
    expect(reset).not.toHaveBeenCalled(); // null to a value is the first choice
    result.chooseRuleset("2014");
    expect(reset).not.toHaveBeenCalled(); // same value
    result.chooseRuleset("2024");
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("scopes the lists to the player's own books exactly when the character lands nowhere", async () => {
    setCampaign("2014");
    const member = ref(false);
    let standalone!: { value: boolean };
    const Child = defineComponent({
      setup() {
        standalone = useContentScope().standalone;
        return () => h("i");
      },
    });
    mount(defineComponent({
      setup() {
        useCharacterCreationEdition({
          isEditMode: false,
          isDmCreate: false,
          existingMember: null,
          isMemberOfActiveCampaign: () => member.value,
        });
        return () => h(Child);
      },
    }));
    expect(standalone.value).toBe(true);
    member.value = true;
    await Promise.resolve();
    expect(standalone.value).toBe(false);
  });
});
