import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import NpcMemoryTab from "./NpcMemoryTab.vue";
import type { NpcListRow } from "@/types/npc.types";

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock("@/composables/npcs/useNpcMemories", () => ({
  useNpcMemories: () => ({ data: ref([]), isPending: ref(false), error: ref(null) }),
  useCreateNpcMemory: () => ({ mutateAsync }),
  useUpdateNpcMemory: () => ({ mutateAsync: vi.fn() }),
  useDeleteNpcMemory: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/npcs/useCampaignSecrets", () => ({
  useCampaignSecrets: () => ({ data: ref([]), isSuccess: ref(true) }),
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ useCampaignSession: () => ({ session: ref(null), isRunning: ref(false) }) }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref([{ id: "p1", name: "Wren" }, { id: "p2", name: "Tomas" }]) }),
}));

const npc = { id: "n1", name: "Mara", disguise_name: null, disguise_portrait_url: null, is_revealed: true } as unknown as NpcListRow;

describe("NpcMemoryTab", () => {
  it("adds a line shared with the whole party and clears only the body", async () => {
    const w = mount(NpcMemoryTab, { props: { npc } });
    expect(w.text()).toContain("Nothing remembered yet");
    const input = w.get('[data-testid="npc-memory-body"]');
    await input.setValue("Admitted the key is hers");
    await w.get('input[type="checkbox"]').setValue(true);
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mutateAsync).toHaveBeenCalledWith({
      memory: {
        npc_id: "n1",
        kind: "revealed",
        body: "Admitted the key is hers",
        session_id: null,
        party_member_ids: [],
        player_visible_to: ["p1", "p2"],
        secret_entity_type: null,
        secret_entity_id: null,
        secret_id: null,
      },
      npcLabel: "Mara",
    });
    expect((input.element as HTMLInputElement).value).toBe("");
  });
});
