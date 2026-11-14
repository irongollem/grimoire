// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuestFlowMarksBar from "./QuestFlowMarksBar.vue";
import { isMacPlatform } from "@/lib/hotkeys";
import { useCampaignStore } from "@/stores/campaign";
import { useQuestsUiStore } from "@/stores/ui/quests";
import type { QuestBeat, QuestBeatTransition } from "@/types/quest.types";
import type { CampaignSession } from "@/types/session.types";

const mocks = vi.hoisted(() => ({
  undo: vi.fn(() => Promise.resolve({ undone_transition_id: "t", current_beat_id: null })),
  sessions: [] as unknown[],
  open: null as unknown,
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useUndoQuestMove: () => ({ mutateAsync: mocks.undo, isPending: { value: false } }),
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useCampaignSessions: () => ({ data: { get value() { return mocks.sessions; } } }),
}));
vi.mock("@/composables/campaign/useCampaignSession", () => ({
  useCampaignSession: () => ({ session: { get value() { return mocks.open; } }, isRunning: { get value() { return mocks.open !== null; } } }),
}));

const session = (id: string, over: Partial<CampaignSession>): CampaignSession => ({
  id, campaign_id: "camp", user_id: "u", number: null, title: null, played_on: null,
  started_at: null, ended_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
});
const transition = (id: string, to: string | null, at: string, title: string | null): QuestBeatTransition => ({
  id, to_beat_id: to, to_beat_title: title, created_at: at,
} as QuestBeatTransition);

const mounted: ReturnType<typeof mount>[] = [];
function mountBar(transitions: QuestBeatTransition[] = []) {
  const wrapper = mount(QuestFlowMarksBar, { props: { questId: "quest-1", transitions, beats: [] as QuestBeat[] }, attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
}
const undoButton = (w: ReturnType<typeof mountBar>) => w.findAll("button").find((b) => b.text().includes("Undo"))!;
// "mod" resolves against the real platform once at load, so the test presses whichever it is.
const press = (target: EventTarget) => target.dispatchEvent(new KeyboardEvent("keydown", { key: "z", code: "KeyZ", ...(isMacPlatform() ? { metaKey: true } : { ctrlKey: true }), bubbles: true, cancelable: true }));

describe("QuestFlowMarksBar", () => {
  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  });
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    setActivePinia(createPinia());
    useCampaignStore().activeCampaignId = "camp";
    mocks.undo.mockClear();
    mocks.sessions = [];
    mocks.open = null;
  });

  // Fails if Undo is enabled with no move, or if it names the wrong move in its tooltip.
  it("is disabled with nothing to undo, and names the move it will take back", () => {
    expect(undoButton(mountBar()).attributes("disabled")).toBeDefined();
    const wrapper = mountBar([
      transition("a", "b1", "2026-01-01T00:00:00Z", "Old beat"),
      transition("b", "b2", "2026-01-02T00:00:00Z", "Good Wolf, Bad Wolf"),
    ]);
    expect(undoButton(wrapper).attributes("disabled")).toBeUndefined();
    expect(undoButton(wrapper).attributes("title")).toBe("Undo: Good Wolf, Bad Wolf");
  });

  // Fails if Undo passes a thread, which would take back only that thread's move instead of the quest's newest.
  it("undoes with no thread", async () => {
    const wrapper = mountBar([transition("a", "b1", "2026-01-01T00:00:00Z", "Beat")]);
    await undoButton(wrapper).trigger("click");
    await flushPromises();
    expect(mocks.undo).toHaveBeenCalledWith({ campaignId: "camp", questId: "quest-1" });
  });

  // Fails if Cmd/Ctrl+Z stops working outside a field, so the registry binding is real.
  it("undoes on Cmd/Ctrl+Z", async () => {
    mountBar([transition("a", "b1", "2026-01-01T00:00:00Z", "Beat")]);
    press(document.body);
    await flushPromises();
    expect(mocks.undo).toHaveBeenCalledTimes(1);
  });

  // Fails if Cmd/Ctrl+Z inside a field undoes a quest move instead of the field's own typing.
  it("leaves Cmd/Ctrl+Z to a text field", async () => {
    mountBar([transition("a", "b1", "2026-01-01T00:00:00Z", "Beat")]);
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(input, editable);
    press(input);
    press(editable);
    await flushPromises();
    expect(mocks.undo).not.toHaveBeenCalled();
  });

  // Fails if the hotkey fires with nothing to undo.
  it("ignores Cmd/Ctrl+Z when there is no move", async () => {
    mountBar();
    press(document.body);
    await flushPromises();
    expect(mocks.undo).not.toHaveBeenCalled();
  });

  // Fails if the chip defaults to something other than the open session.
  it("defaults the chip to the open session, else the last played", () => {
    mocks.sessions = [
      session("s1", { number: 11, started_at: "2026-02-01T18:00:00Z", ended_at: "2026-02-01T22:00:00Z" }),
      session("s2", { number: 12, started_at: "2026-03-01T18:00:00Z" }),
    ];
    mocks.open = mocks.sessions[1];
    expect((mountBar().get("select").element as HTMLSelectElement).value).toBe("s2");
    mocks.open = null;
    mocks.sessions = [mocks.sessions[0]];
    expect((mountBar().get("select").element as HTMLSelectElement).value).toBe("s1");
  });

  // Fails if the DM's pick is not stored for this campaign.
  it("stores the DM's pick for the campaign", async () => {
    mocks.sessions = [
      session("s1", { number: 11, started_at: "2026-02-01T18:00:00Z", ended_at: "2026-02-01T22:00:00Z" }),
      session("s2", { number: 12, started_at: "2026-03-01T18:00:00Z", ended_at: "2026-03-01T22:00:00Z" }),
    ];
    const wrapper = mountBar();
    await wrapper.get("select").setValue("s1");
    expect(useQuestsUiStore().markSessionChoiceFor("camp").value).toBe("s1");
    expect(useQuestsUiStore().markSessionChoiceFor("other").value).toBe("");
  });

  // Fails if a campaign with no sessions still offers a pick that cannot be honoured.
  it("disables the chip and says so when the campaign has no sessions", () => {
    mocks.sessions = [];
    const select = mountBar().get("select");
    expect(select.attributes("disabled")).toBeDefined();
    expect(select.text()).toBe("No sessions yet");
  });
});
