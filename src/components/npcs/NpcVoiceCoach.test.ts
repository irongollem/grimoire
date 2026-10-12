import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import NpcVoiceCoach from "./NpcVoiceCoach.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import type { Npc } from "@/types/npc.types";

/**
 * Every plan may run AI generation as long as the campaign's AI Assistant
 * toggle is on and the account can afford the credit cost (see
 * ai-policy-spec.md) — there is no Pro gate on generation itself, only on
 * BYOK. This covers the two states that matter for that policy: AI on shows
 * the real Suggest lines button for a Free account, AI off shows AiOffNotice
 * instead, regardless of plan.
 */

function npc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: "npc-1",
    user_id: "u1",
    campaign_id: "campaign-1",
    name: "Elowen Vance",
    race: "Half-Elf",
    alignment: "neutral good",
    age: "34",
    occupation: "Innkeeper",
    location_id: null,
    appearance: null,
    personality: null,
    backstory: null,
    notes: null,
    status: "alive",
    relationship: "friendly",
    portrait_url: null,
    disguise_name: null,
    disguise_portrait_url: null,
    is_revealed: true,
    tags: [],
    stat_block: null,
    linked_monster_id: null,
    scriptorium_doc_id: null,
    player_visible_to: [],
    player_visible_fields: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Npc;
}

const mocks = vi.hoisted(() => ({
  suggest: vi.fn(),
  clear: vi.fn(),
  createMemory: vi.fn(),
  toastError: vi.fn(),
}));

const isAiEnabled = ref(true);

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
    activeCampaign: { text_provider: "openai" },
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base), textIsByok: ref(false) }),
}));
const coachLines = ref<string[]>([]);
vi.mock("@/composables/campaign/useCampaignSession", () => ({
  useCampaignSession: () => ({ session: ref({ id: "run-1" }), isRunning: ref(true) }),
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useCampaignSessions: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/npcs/useNpcMemories", () => ({
  useCreateNpcMemory: () => ({ mutateAsync: mocks.createMemory, isPending: ref(false) }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, fromError: (e: Error) => e.message }),
}));
vi.mock("@/ai/useNpcVoiceCoach", () => ({
  useNpcVoiceCoach: () => ({
    isGenerating: ref(false),
    error: ref(null),
    lines: coachLines,
    provenance: ref({ generatorType: "npc_voice", provider: "openai", model: "m", generatedAt: "t", edited: false }),
    suggest: mocks.suggest,
    clear: mocks.clear,
  }),
}));

function mountCoach() {
  return mount(NpcVoiceCoach, {
    props: { npc: npc() },
    global: { stubs: { GenerationCostBadge: true, RouterLink: RouterLinkStub } },
  });
}

describe("NpcVoiceCoach", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    mocks.suggest.mockReset();
    mocks.clear.mockReset();
    mocks.createMemory.mockReset();
    mocks.toastError.mockReset();
    coachLines.value = [];
  });

  it("shows the real Suggest lines button on a Free account once AI is on", () => {
    const wrapper = mountCoach();
    expect(wrapper.find('button[aria-label="Suggest lines"]').exists()).toBe(true);
    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(false);
  });

  it("shows AiOffNotice instead of a Generate button when AI is off, on any plan", () => {
    isAiEnabled.value = false;
    const wrapper = mountCoach();
    expect(wrapper.find('button[aria-label="Suggest lines"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("AI is off for this campaign");
  });

  it("files a suggested line as a DM-only revealed memory in the running session", async () => {
    coachLines.value = ["  The gate shuts at dusk.  "];
    mocks.createMemory.mockResolvedValue({});
    const wrapper = mountCoach();
    await wrapper.find('button[aria-label="Said it"]').trigger("click");
    await flushPromises();
    expect(mocks.createMemory).toHaveBeenCalledWith({
      memory: expect.objectContaining({
        npc_id: "npc-1",
        kind: "revealed",
        body: "The gate shuts at dusk.",
        session_id: "run-1",
        party_member_ids: [],
        player_visible_to: [],
        ai_provenance: expect.objectContaining({ generatorType: "npc_voice" }),
      }),
      npcLabel: "Elowen Vance",
    });
    const done = wrapper.find('button[aria-label="Remembered"]');
    expect(done.exists()).toBe(true);
    expect(done.attributes("disabled")).toBeDefined();
  });

  it("toasts and leaves the button usable when filing fails", async () => {
    coachLines.value = ["Hello."];
    mocks.createMemory.mockRejectedValue(new Error("nope"));
    const wrapper = mountCoach();
    await wrapper.find('button[aria-label="Said it"]').trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalledWith("nope");
    expect(wrapper.find('button[aria-label="Said it"]').exists()).toBe(true);
  });
});
