import { describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";

const speciesRows = ref<Array<{ id: string; name: string }>>([]);
vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useCampaignSpecies: () => ({ species: speciesRows }),
}));
const empty = { data: ref([]) };
vi.mock("@/composables/party/useParty", () => ({ useParty: () => empty }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => empty }));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({ useMonsterIndex: () => empty }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => empty }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => empty }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: null }) }));

import { useEntityMentionItems } from "./useEntityMentionItems";

describe("useEntityMentionItems", () => {
  // Bug: species were never offered by the @ picker, so they could not be mentioned.
  it("offers each species by its common name", () => {
    speciesRows.value = [{ id: "sp-1", name: "Gloomwren" }];
    const scope = effectScope();
    const { mentionItems } = scope.run(() => useEntityMentionItems())!;
    expect(computed(() => mentionItems.value).value).toEqual([{ id: "sp-1", entityType: "species", label: "Gloomwren" }]);
    scope.stop();
  });
});
