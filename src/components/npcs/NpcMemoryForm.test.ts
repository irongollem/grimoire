import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import NpcMemoryForm, { type NpcMemoryDraft } from "./NpcMemoryForm.vue";
import type { CampaignSecret, NpcMemory } from "@/types/npcMemory.types";

const secrets = ref<CampaignSecret[]>([]);
vi.mock("@/composables/npcs/useCampaignSecrets", () => ({
  useCampaignSecrets: () => ({ data: secrets, isSuccess: ref(true) }),
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ useCampaignSession: () => ({ session: ref(null), isRunning: ref(false) }) }));
vi.mock("vue-router", () => ({ RouterLink: { props: ["to"], template: "<a><slot /></a>" } }));

const secret: CampaignSecret = {
  entity_type: "location",
  entity_id: "loc1",
  entity_name: "The Chapel",
  field: "description",
  secret_id: "sec1",
  excerpt: "The bell is hollow",
};

beforeEach(() => {
  secrets.value = [];
});

describe("NpcMemoryForm secret picker", () => {
  it("hides the button when the campaign has no secrets", () => {
    const w = mount(NpcMemoryForm, { props: { members: [], save: vi.fn() } });
    expect(w.find('[data-testid="npc-memory-secret-open"]').exists()).toBe(false);
  });

  it("sends the three fields for a picked secret and clears them after an add", async () => {
    secrets.value = [secret];
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const w = mount(NpcMemoryForm, { props: { members: [], save }, attachTo: document.body });
    await w.get('[data-testid="npc-memory-secret-open"]').trigger("click");
    const input = w.get('input[data-field="combobox"]');
    await input.trigger("focus");
    await flushPromises();
    const option = document.body.querySelector("ul[data-slip] li");
    expect(option?.textContent).toContain("Location · The Chapel");
    option?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(w.get('[data-testid="npc-memory-secret"]').text()).toContain("The bell is hollow");

    await w.get('[data-testid="npc-memory-body"]').setValue("Let slip the bell");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(save.mock.calls[0][0]).toMatchObject({ secret_entity_type: "location", secret_entity_id: "loc1", secret_id: "sec1" });
    expect(w.find('[data-testid="npc-memory-secret"]').exists()).toBe(false);
    w.unmount();
  });

  it("sends nulls once an edited line's secret is cleared", async () => {
    secrets.value = [secret];
    const save = vi.fn<(d: NpcMemoryDraft) => Promise<boolean>>().mockResolvedValue(true);
    const initial = {
      kind: "revealed",
      body: "Let slip the bell",
      session_id: null,
      party_member_ids: [],
      player_visible_to: [],
      secret_entity_type: "location",
      secret_entity_id: "loc1",
      secret_id: "sec1",
    } as unknown as NpcMemory;
    const w = mount(NpcMemoryForm, { props: { members: [], initial, save } });
    expect(w.get('[data-testid="npc-memory-secret"]').text()).toContain("The Chapel");
    await w.get('[data-testid="npc-memory-secret-clear"]').trigger("click");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(save.mock.calls[0][0]).toMatchObject({ secret_entity_type: null, secret_entity_id: null, secret_id: null });
  });
});
