import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import NpcVoiceCoach from "./NpcVoiceCoach.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import type { Npc } from "@/types/npc.types";

/**
 * Every plan may run AI generation as long as the campaign's AI Assistant
 * toggle is on and the account can afford the credit cost (see
 * ai-policy-spec.md) — there is no Pro gate on generation itself.
 * This covers the two states that matter for that policy: AI on shows
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

const ask = vi.hoisted(() => ({ open: vi.fn() }));
const isAiEnabled = ref(true);

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
  }),
}));
vi.mock("@/composables/ask/useOpenGenerator", () => ({ useOpenGenerator: () => ({ open: ask.open }) }));

function mountCoach(over: Partial<Npc> = {}) {
  return mount(NpcVoiceCoach, { props: { npc: npc(over) }, global: { stubs: { RouterLink: RouterLinkStub } } });
}

describe("NpcVoiceCoach", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    ask.open.mockReset();
  });

  it("shows the Suggest lines button on a Free account once AI is on", () => {
    const wrapper = mountCoach();
    expect(wrapper.find('button[aria-label="Suggest lines"]').exists()).toBe(true);
    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(false);
  });

  it("shows AiOffNotice instead of a Suggest button when AI is off, on any plan", () => {
    isAiEnabled.value = false;
    const wrapper = mountCoach();
    expect(wrapper.find('button[aria-label="Suggest lines"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("AI is off for this campaign");
  });

  // Fails on: the card opening with no NPC to speak for, so its gilt button could never run.
  it("opens the Familiar's voice card with this NPC as its target", async () => {
    await mountCoach().get('button[aria-label="Suggest lines"]').trigger("click");
    expect(ask.open).toHaveBeenCalledWith("npc_voice", { target: { type: "npc", id: "npc-1", name: "Elowen Vance" } });
  });

  // Fails on: a disguised NPC being named by their real name on a card the DM may share the screen with.
  it("names a disguised NPC by the name they are wearing", async () => {
    await mountCoach({ disguise_name: "Old Tam", disguise_portrait_url: "d.webp", is_revealed: false }).get('button[aria-label="Suggest lines"]').trigger("click");
    expect(ask.open).toHaveBeenCalledWith("npc_voice", { target: { type: "npc", id: "npc-1", name: "Old Tam" } });
  });
});
