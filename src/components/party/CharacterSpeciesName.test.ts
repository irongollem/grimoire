import { describe, expect, it, vi } from "vitest";
import { computed, defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

// The species list each edition offers. The component under test must resolve
// the name in the CHARACTER's edition, so the map depends on the edition in scope.
const SPECIES: Record<RulesetKey, [string, string][]> = {
  "2014": [["sp-2014", "Half-Orc"]],
  "2024": [["sp-2024", "Goliath"]],
};

vi.mock("@/composables/rules/useSpecies", () => ({
  useSpeciesNameMap: () => {
    const { ruleset } = useRuleset();
    return computed(() => new Map(SPECIES[ruleset.value]));
  },
}));

import CharacterSpeciesName from "./CharacterSpeciesName.vue";

function mountRow(member: { ruleset: RulesetKey; campaign_id: string | null; species_id: string | null }) {
  setActivePinia(createPinia());
  // A row the way every list uses the component: its whole content is the default slot.
  const Row = defineComponent({
    setup() {
      return () => h(CharacterSpeciesName, { member }, {
        default: ({ speciesName }: { speciesName: string | null }) =>
          h("p", { "data-testid": "row" }, `row for ${speciesName === null ? "no species" : speciesName}`),
      });
    },
  });
  return mount(Row);
}

describe("CharacterSpeciesName", () => {
  it("renders its default slot (a slot prop called `name` would have named the slot instead, and the row vanished)", () => {
    const wrapper = mountRow({ ruleset: "2014", campaign_id: null, species_id: "sp-2014" });
    expect(wrapper.find('[data-testid="row"]').exists()).toBe(true);
    expect(wrapper.text()).toBe("row for Half-Orc");
  });

  it("resolves the name in the character's own edition, whatever the campaign plays", () => {
    // No campaign is active, so campaign scope would resolve 2014 and find nothing for a 2024 species.
    const wrapper = mountRow({ ruleset: "2024", campaign_id: null, species_id: "sp-2024" });
    expect(wrapper.text()).toBe("row for Goliath");
  });

  it("still renders the row for a character with no species, or one it cannot resolve", () => {
    expect(mountRow({ ruleset: "2014", campaign_id: null, species_id: null }).text()).toBe("row for no species");
    expect(mountRow({ ruleset: "2014", campaign_id: null, species_id: "gone" }).text()).toBe("row for no species");
  });
});
