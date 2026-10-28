import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestPlayerPreviewDrawer from "./QuestPlayerPreviewDrawer.vue";
import type { PlayerQuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  enterDmPreview: vi.fn(),
  push: vi.fn(),
  previewRef: null as unknown,
  beats: [] as PlayerQuestBeat[],
  assumed: null as string | null,
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
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ dmPreviewPartyMemberId: mocks.assumed, enterDmPreview: mocks.enterDmPreview }) }));
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
    mocks.assumed = null;
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

  // The drawer is wider only when there is more than one thread column to fit;
  // no layout runs here, so the width class is the one thing that shows it.
  it.each([
    ["a single-thread quest stays at the narrow width", [beat()], "max-w-xl", "max-w-5xl"],
    ["a quest with more than one thread column widens to fit it", [
      beat({ id: "petition-1", thread_id: "thread-main", thread_label: "Main" }),
      beat({ id: "vault-1", story_order: 1, thread_id: "thread-vault", thread_label: "The Drowned Vault" }),
    ], "max-w-5xl", "max-w-xl"],
  ])("%s", (_name, beats, has, hasNot) => {
    mocks.beats = beats;
    const wrapper = mount(QuestPlayerPreviewDrawer, {
      props: { questId: "quest-1", visibleTo: ["member-1"] },
      global: { stubs: { Teleport: true, PlayerQuestStoryThread: true } },
    });
    expect(wrapper.get("aside").classes()).toContain(has);
    expect(wrapper.get("aside").classes()).not.toContain(hasNot);
  });

  const mountDrawer = (visibleTo: string[]) => mount(QuestPlayerPreviewDrawer, {
    props: { questId: "quest-1", visibleTo },
    global: { stubs: { Teleport: true, PlayerQuestStoryThread: true } },
  });

  it("a quest shared with nobody loads no projection at all, says so, and offers no way into the player route", async () => {
    const wrapper = mountDrawer([]);
    expect(wrapper.text()).toContain("This quest is not shared with a party character yet.");
    expect((mocks.previewRef as { value: string | null }).value).toBeNull();
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
    const open = wrapper.findAll("button").find((button) => button.text() === "Open actual player route")!;
    expect(open.attributes("disabled")).toBeDefined();
    await open.trigger("click");
    expect(mocks.enterDmPreview).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("opens as the character the DM was already assuming when the quest is shared with them, else as the first shared character", () => {
    mocks.assumed = "member-2";
    const both = mountDrawer(["member-1", "member-2"]);
    expect((mocks.previewRef as { value: string }).value).toBe("member-2");
    expect(both.text()).toContain("Viewing exactly what Hidden is authorized to receive.");
    mocks.assumed = "member-2";
    mountDrawer(["member-1"]);
    expect((mocks.previewRef as { value: string }).value).toBe("member-1");
  });

  it("Escape closes the drawer while it is open, and stops listening once it is gone", () => {
    const onClose = vi.fn();
    const wrapper = mount(QuestPlayerPreviewDrawer, {
      props: { questId: "quest-1", visibleTo: ["member-1"], onClose },
      global: { stubs: { Teleport: true, PlayerQuestStoryThread: true } },
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onClose).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
