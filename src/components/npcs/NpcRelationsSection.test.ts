import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import type { NpcRelation } from "@/types/npc.types";

const updateRelation = vi.fn().mockResolvedValue(undefined);
const relations = ref<NpcRelation[]>([]);

vi.mock("@/composables/factions/useNpcRelations", () => ({
  useNpcRelations: () => ({ data: relations }),
  useCreateNpcRelation: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useDeleteNpcRelation: () => ({ mutateAsync: vi.fn() }),
  useUpdateNpcRelation: () => ({ mutateAsync: updateRelation }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useAddFactionNpc: () => ({ mutateAsync: vi.fn() }),
  useAllFactions: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: ref([{ id: "a", name: "Ulkora" }, { id: "b", name: "Gunvald" }]) }),
}));
vi.mock("@/composables/npcs/useNpcPeek", () => ({ useOpenNpc: () => vi.fn() }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/kinship/useKinLinks", () => ({ useCreateKinLink: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: false }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 0 }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({}) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({}) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/ai/useNpcRelationshipSuggestions", () => ({
  useNpcRelationshipSuggestions: () => ({
    suggest: vi.fn(),
    forNpc: () => ({
      isGenerating: ref(false),
      suggestions: ref([]),
      setAside: ref([]),
      provenance: ref(null),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    }),
  }),
}));

import NpcRelationsSection from "./NpcRelationsSection.vue";

function row(npc_id: string, related_npc_id: string, relationship_type: string): NpcRelation {
  return { id: "r1", npc_id, related_npc_id, relationship_type, notes: null } as NpcRelation;
}

describe("NpcRelationsSection: changing a connection's type", () => {
  beforeEach(() => updateRelation.mockClear());

  it("stores the type as chosen on a row this NPC wrote", async () => {
    relations.value = [row("a", "b", "superior")];
    const w = mount(NpcRelationsSection, { props: { npcId: "a" } });
    const select = w.find("select");
    expect((select.element as HTMLSelectElement).value).toBe("superior");
    // On Ulkora's sheet, Gunvald's card says whose superior he is.
    expect(select.findAll("option").find((o) => o.element.value === "superior")?.text()).toBe("Ulkora's superior");
    await select.setValue("subordinate");
    await flushPromises();
    expect(updateRelation).toHaveBeenCalledWith({ id: "r1", update: { relationship_type: "subordinate" } });
  });

  it("stores the inverse on a row the other NPC wrote", async () => {
    // Written from b's side: a is b's superior, so b reads as a's subordinate here.
    relations.value = [row("b", "a", "superior")];
    const w = mount(NpcRelationsSection, { props: { npcId: "a" } });
    const select = w.find("select");
    expect((select.element as HTMLSelectElement).value).toBe("subordinate");
    await select.setValue("superior");
    await flushPromises();
    expect(updateRelation).toHaveBeenCalledWith({ id: "r1", update: { relationship_type: "subordinate" } });
  });
});
