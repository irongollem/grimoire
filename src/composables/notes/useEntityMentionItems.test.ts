import { describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";

const speciesRows = ref<Array<{ id: string; name: string }>>([]);
const speciesWanted = vi.hoisted(() => ({ last: null as null | (() => boolean) }));
vi.mock("@/composables/canon/useSpeciesNames", () => ({
  useSpeciesNames: (wanted: () => boolean) => {
    speciesWanted.last = wanted;
    return { species: speciesRows };
  },
}));
const routePath = vi.hoisted(() => ({ value: "/npcs" }));
vi.mock("vue-router", () => ({ useRoute: () => ({ path: routePath.value }) }));
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

  // Bug: every player's editor read the DM-only field guide on mount (requests RLS answered with nothing).
  it("reads the field guide only on the DM's side", () => {
    const scope = effectScope();
    routePath.value = "/npcs";
    scope.run(() => useEntityMentionItems());
    expect(speciesWanted.last?.()).toBe(true);
    routePath.value = "/play/journal";
    scope.run(() => useEntityMentionItems());
    expect(speciesWanted.last?.()).toBe(false);
    scope.stop();
  });
});
