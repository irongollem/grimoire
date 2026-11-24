// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

const open = vi.fn();
const campaign = { isAiEnabled: true, activeCampaign: { current_location_id: "place-1" } as { current_location_id: string | null } };
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ query: {} }) }));
vi.mock("@/composables/ask/useOpenGenerator", () => ({ useOpenGenerator: () => ({ open }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaign }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: ref([]) }) }));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/useListLayout", () => ({ useListLayout: () => ref("grid") }));

import EncountersView from "./EncountersView.vue";

const stubs = { ListActionButton: { emits: ["click"], template: '<button data-testid="generate" @click="$emit(\'click\')" />' }, ListPageLayout: { template: "<div><slot name='actions' /></div>" } };

describe("EncountersView Generate", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    open.mockClear();
    campaign.activeCampaign = { current_location_id: "place-1" };
  });

  // Bug caught: the card opening with Where empty, so the encounter was rolled from nowhere instead of where the party is.
  it("opens the encounter's card set where the party is", async () => {
    const w = shallowMount(EncountersView, { global: { stubs } });
    await w.get('[data-testid="generate"]').trigger("click");
    expect(open).toHaveBeenCalledWith("encounter", { inputs: { location_id: "place-1" } });
  });

  // Bug caught: a null place sent as an input, which the card would read as a place.
  it("names no place when the party has none", async () => {
    campaign.activeCampaign = { current_location_id: null };
    const w = shallowMount(EncountersView, { global: { stubs } });
    await w.get('[data-testid="generate"]').trigger("click");
    expect(open).toHaveBeenCalledWith("encounter", {});
  });
});
