import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestPlayerPreviewDrawer from "./QuestPlayerPreviewDrawer.vue";
import type { PlayerQuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  enterDmPreview: vi.fn(),
  push: vi.fn(),
  previewRef: null as unknown,
  beats: [] as PlayerQuestBeat[],
}));

function beat(overrides: Partial<PlayerQuestBeat> = {}): PlayerQuestBeat {
  return {
    id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", visibility: "revealed",
    kind: "social", presentation_hint: null, player_text: "Safe reveal", story_order: 0,
    attachments: [], visits: [], updated_at: "now", staged_at_location_id: null,
    thread_id: "thread-main", thread_label: "Main", is_current: false, payoff: [],
    ...overrides,
  };
}
mocks.beats = [beat()];

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ dmPreviewPartyMemberId: null, enterDmPreview: mocks.enterDmPreview }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { value: [{ id: "member-1", name: "Mira" }, { id: "member-2", name: "Hidden" }] } }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  usePlayerQuestBeats: (_questId: unknown, previewRef: unknown) => {
    mocks.previewRef = previewRef;
    return { data: { value: mocks.beats }, isLoading: { value: false }, error: { value: null } };
  },
}));

describe("QuestPlayerPreviewDrawer", () => {
  beforeEach(() => {
    mocks.enterDmPreview.mockReset();
    mocks.push.mockReset();
    mocks.beats = [beat()];
  });

  it("renders the shared player story component with the exact safe DTO and selected audience", () => {
    const wrapper = mount(QuestPlayerPreviewDrawer, {
      props: { questId: "quest-1", visibleTo: ["member-1"], selectedBeatId: "beat-1", savedVisibility: "hidden" },
      global: { stubs: { Teleport: true, PlayerQuestStoryThread: { props: ["beats"], template: '<div class="story">{{ beats[0].player_text }}</div>' } } },
    });
    expect(wrapper.text()).toContain("Viewing exactly what Mira is authorized to receive.");
    expect(wrapper.get(".story").text()).toBe("Safe reveal");
    expect(wrapper.text()).not.toContain("Hidden");
    expect((mocks.previewRef as { value: string }).value).toBe("member-1");
  });

  it("labels unsaved visibility separately from the saved preview", () => {
    const wrapper = mount(QuestPlayerPreviewDrawer, {
      props: { questId: "quest-1", visibleTo: ["member-1"], savedVisibility: "hidden", draftVisibility: "revealed" },
      global: { stubs: { Teleport: true, PlayerQuestStoryThread: true } },
    });
    expect(wrapper.text()).toContain("Unsaved draft: revealed. Preview still shows the saved hidden state.");
  });

  it("enters the existing assumed-player mode only for the explicit full-route action", async () => {
    const wrapper = mount(QuestPlayerPreviewDrawer, {
      props: { questId: "quest-1", visibleTo: ["member-1"] },
      global: { stubs: { Teleport: true, PlayerQuestStoryThread: true } },
    });
    await wrapper.findAll("button").find((button) => button.text() === "Open actual player route")!.trigger("click");
    expect(mocks.enterDmPreview).toHaveBeenCalledWith("member-1");
    expect(mocks.push).toHaveBeenCalledWith("/play/quests/quest-1");
  });

  it("stays at the narrow width for a single-thread quest", () => {
    mocks.beats = [beat()];
    const wrapper = mount(QuestPlayerPreviewDrawer, {
      props: { questId: "quest-1", visibleTo: ["member-1"] },
      global: { stubs: { Teleport: true, PlayerQuestStoryThread: true } },
    });
    expect(wrapper.get("aside").classes()).toContain("max-w-xl");
    expect(wrapper.get("aside").classes()).not.toContain("max-w-5xl");
  });

  it("widens to fit more than one thread column", () => {
    mocks.beats = [
      beat({ id: "petition-1", thread_id: "thread-main", thread_label: "Main" }),
      beat({ id: "vault-1", story_order: 1, thread_id: "thread-vault", thread_label: "The Drowned Vault" }),
    ];
    const wrapper = mount(QuestPlayerPreviewDrawer, {
      props: { questId: "quest-1", visibleTo: ["member-1"] },
      global: { stubs: { Teleport: true, PlayerQuestStoryThread: true } },
    });
    expect(wrapper.get("aside").classes()).toContain("max-w-5xl");
    expect(wrapper.get("aside").classes()).not.toContain("max-w-xl");
  });
});
