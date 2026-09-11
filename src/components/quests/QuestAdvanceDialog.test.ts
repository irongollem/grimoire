import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestAdvanceDialog from "./QuestAdvanceDialog.vue";
import type { QuestRuntimeContext } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  improvise: vi.fn(),
  // Filled in by the `useBreakpoint` mock factory below, with a genuine Vue
  // `ref` (not a plain box): the component reads it straight in the template
  // (`v-if="isMobile"`), which only auto-unwraps a real ref — a plain
  // `{ value }` object is truthy on its own and would read as "mobile"
  // unconditionally. Built inside the factory (rather than up here) because
  // `vi.hoisted` runs before `vue` itself is available to import from.
  isMobile: undefined as unknown as { value: boolean },
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestRuntimeCommand: () => ({ mutateAsync: mocks.command }),
  useQuestRuntimeImprovise: () => ({ mutateAsync: mocks.improvise }),
}));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => {
  const { ref } = await import("vue");
  mocks.isMobile = ref(false);
  return {
    ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
    useBelow: () => mocks.isMobile,
  };
});

function buildContext(): QuestRuntimeContext {
  return {
    state: { campaign_id: "campaign-1", quest_id: "quest-1", thread_id: "thread-a", current_beat_id: "beat-current", return_stack: [], visit_stack: [], visit_index: 0, status: "running", version: 4, updated_by: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
    current: {
      id: "beat-current", quest_id: "quest-1", campaign_id: "campaign-1", title: "Confront Ser Vallis",
      dm_content: null, read_aloud: null, how_it_plays: null, rumor_text: null, reveal_text: null,
      visibility: "revealed", kind: "social", presentation_hint: null, converge_mode: "any",
      staged_at_location_id: null, canvas_x: 0, canvas_y: 0, is_improvised: false, improv_reviewed_at: null,
      created_by: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    },
    previous: null,
    return_target: null,
    path_so_far: [],
    thread: { id: "thread-a", campaign_id: "campaign-1", quest_id: "quest-1", label: "Main", status: "live", opened_by_edge_id: null, parent_thread_id: null, merged_into_thread_id: null, created_by: null, created_at: "2026-09-01T00:00:00Z", closed_at: null, updated_at: "2026-09-01T00:00:00Z" },
    threads: [{ id: "thread-a", campaign_id: "campaign-1", quest_id: "quest-1", label: "Main", status: "live", opened_by_edge_id: null, parent_thread_id: null, merged_into_thread_id: null, created_by: null, created_at: "2026-09-01T00:00:00Z", closed_at: null, updated_at: "2026-09-01T00:00:00Z", current_beat_id: "beat-current", current_beat_title: "Confront Ser Vallis", runtime_status: "running", version: 4 }],
    held: [],
    outgoing: [
      {
        edge_id: "edge-1", quest_id: "quest-1", beat_id: "beat-target", beat_title: "Testify before the Guild", beat_kind: "social",
        gate: null, effects: [], route_kind: "choice", thread_label: null, converge_mode: "any", site: null,
        payoff: [
          { consequence_id: "c1", action: "shift_npc_relationship", target_objective_id: null, target_objective: null, target_npc_id: "npc-1", target_npc: "Ashmouth Guild", target_quest_id: null, target_quest: null, action_payload: { step: -1 }, after_days: 0, on_edge: true },
          { consequence_id: "c2", action: "owe_favor", target_objective_id: null, target_objective: null, target_npc_id: "npc-2", target_npc: "Ser Vallis", target_quest_id: null, target_quest: null, action_payload: { text: "Ser Vallis owes the party" }, after_days: 0, on_edge: false },
        ],
        loot: [{ id: "l1", kind: "currency", label: "80 gp, skimmed", quantity: 80, item_id: null }],
      },
      {
        edge_id: "edge-2", quest_id: "quest-1", beat_id: "beat-watch", beat_title: "Flee the cloister", beat_kind: "combat",
        gate: { objective_id: "o1", objective: "the guard is dealt with", required_status: "complete", current_status: "pending", is_open: false },
        effects: [], route_kind: "choice", thread_label: null, converge_mode: "any", site: null, payoff: [], loot: [],
      },
      {
        edge_id: "edge-3", quest_id: "quest-1", beat_id: "beat-crypt", beat_title: "The cloister's sealed crypt", beat_kind: "explore",
        gate: null, effects: [], route_kind: "parallel", thread_label: "C", converge_mode: "any",
        site: { location_id: "loc-1", name: "The sealed crypt", room_count: 3 }, payoff: [], loot: [],
      },
    ],
  };
}

async function mountDialog(overrides: Partial<InstanceType<typeof QuestAdvanceDialog>["$props"]> = {}) {
  const wrapper = mount(QuestAdvanceDialog, {
    props: { open: true, context: buildContext(), threadLetter: "A", ...overrides },
    global: { stubs: { Teleport: true } },
    // isVisible() reads getComputedStyle, which only resolves correctly for a
    // node attached to the document — needed below to assert the mobile
    // step's v-show state rather than just its style attribute.
    attachTo: document.body,
  });
  await wrapper.vm.$nextTick();
  return wrapper;
}

function radios(wrapper: Awaited<ReturnType<typeof mountDialog>>) {
  return wrapper.findAll("input[type=radio]");
}

describe("QuestAdvanceDialog", () => {
  beforeEach(() => {
    mocks.command.mockReset();
    mocks.improvise.mockReset();
    mocks.command.mockImplementation(async () => buildContext());
    mocks.improvise.mockImplementation(async () => ({ context: buildContext(), beat: {} }));
    mocks.isMobile.value = false;
  });

  it("lists the open choice routes plus the dashed improvise option, and disables the closed one with its condition", async () => {
    const wrapper = await mountDialog();
    expect(wrapper.text()).toContain("Testify before the Guild");
    expect(wrapper.text()).toContain("Flee the cloister");
    expect(wrapper.text()).toContain("Something else happened");
    expect(wrapper.text()).toContain("needs");
    const closedRadio = radios(wrapper)[1]!;
    expect((closedRadio.element as HTMLInputElement).disabled).toBe(true);
  });

  it("disables Advance until a route or an improvised title is chosen", async () => {
    const wrapper = await mountDialog();
    const advance = () => wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Advance")!;
    expect(advance().props("disabled")).toBe(true);

    await radios(wrapper)[0]!.trigger("change");
    expect(advance().props("disabled")).toBe(false);
  });

  // Design frame `05 Advance`: "Creates Thread C at that beat" — the caption
  // names the letter the spawned thread will actually get, not the route's
  // authored thread_label ("C" here), and a route with no projected letter
  // yet (no choice picked) reads as an open offer instead.
  it("names the projected spawn letter once a route is chosen, and reads as an open offer before that", async () => {
    const wrapper = await mountDialog();
    expect(wrapper.text()).toContain("Would open a thread “C” at that beat.");

    await radios(wrapper)[0]!.trigger("change");
    // One existing thread ("Main") becomes A; the ticked parallel route's
    // projected thread is B — the fixture's authored thread_label "C" is
    // quoted as the route's name, not mistaken for the thread's own letter.
    expect(wrapper.text()).toContain("Creates Thread B — “C” — at that beat.");
  });

  it("shows the selected route's payoff and loot, and recomputes the footer as ticks change", async () => {
    const wrapper = await mountDialog();
    await radios(wrapper)[0]!.trigger("change");

    expect(wrapper.text()).toContain("Worsen an NPC's disposition by 1 step");
    expect(wrapper.text()).toContain("80× 80 gp, skimmed");
    expect(wrapper.text()).toContain("2 consequences fired");
    // The loot row is unticked by default, so it stays held.
    expect(wrapper.text()).toContain("1 loot held");

    // Untick the first payoff row: fired drops to 1, and the row shows "held".
    const payoffChecks = wrapper.get('section[aria-label="Payoff from this route"]').findAll("input[type=checkbox]");
    await payoffChecks[0]!.setValue(false);
    expect(wrapper.text()).toContain("1 consequence fired");
    expect(wrapper.text()).toContain("held");
  });

  it("submits the chosen route with the ticked spawns and the unticked payoff held back", async () => {
    const wrapper = await mountDialog();
    await radios(wrapper)[0]!.trigger("change");

    const advance = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Advance")!;
    await advance.trigger("click");
    await wrapper.vm.$nextTick();
    await flush();

    expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: "campaign-1",
      questId: "quest-1",
      threadId: "thread-a",
      command: "advance",
      edgeId: "edge-1",
      expectedVersion: 4,
      spawnEdgeIds: ["edge-3"],
      holdConsequenceIds: [],
      dispatchLootIds: [],
    }));
    expect(wrapper.emitted("advanced")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("reveals the improvise fields and submits through useQuestRuntimeImprovise, without touching the runtime command", async () => {
    const wrapper = await mountDialog();
    const dashedRadio = radios(wrapper).at(-1)!;
    await dashedRadio.trigger("change");
    expect(wrapper.text()).not.toContain("Payoff from this route");

    const advance = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Advance")!;
    expect(advance.props("disabled")).toBe(true);

    await wrapper.find("input[placeholder='What just happened?']").setValue("They sacrificed a goat to Ravishin");
    expect(advance.props("disabled")).toBe(false);
    await advance.trigger("click");
    await flush();

    expect(mocks.improvise).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-a",
      title: "They sacrificed a goat to Ravishin",
      expectedVersion: 4,
    }));
    expect(mocks.command).not.toHaveBeenCalled();
    expect(wrapper.emitted("advanced")).toHaveLength(1);
  });

  it("reads a stale-version rejection as a version conflict and stays open", async () => {
    mocks.command.mockRejectedValueOnce({ code: "40001" });
    const wrapper = await mountDialog();
    await radios(wrapper)[0]!.trigger("change");
    const advance = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Advance")!;
    await advance.trigger("click");
    await flush();

    expect(wrapper.text()).toContain("The session moved on another device — reopen to advance.");
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  // Design frame `02 Advance`: below `sm` the modal becomes a full-height sheet
  // with a two-step body. Same `planAdvance` + RPC path either way — only the
  // step index is local, presentational UI state.
  describe("below sm", () => {
    beforeEach(() => {
      mocks.isMobile.value = true;
    });

    function findButton(wrapper: Awaited<ReturnType<typeof mountDialog>>, label: string) {
      return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!;
    }

    it("step 1 shows only the route section, with Continue disabled until a route is chosen", async () => {
      const wrapper = await mountDialog();
      expect(wrapper.get('section[aria-label="The route taken — the others become unreachable"]').isVisible()).toBe(true);
      expect(wrapper.get('section[aria-label="Also opens — both paths get walked"]').isVisible()).toBe(false);
      expect(wrapper.text()).toContain("Leaving “Confront Ser Vallis”");

      expect(findButton(wrapper, "Continue").props("disabled")).toBe(true);
      await radios(wrapper)[0]!.trigger("change");
      expect(findButton(wrapper, "Continue").props("disabled")).toBe(false);
    });

    it("Continue moves to step 2, and Back returns to step 1 keeping the chosen route", async () => {
      const wrapper = await mountDialog();
      await radios(wrapper)[0]!.trigger("change");
      await findButton(wrapper, "Continue").trigger("click");

      expect(wrapper.get('section[aria-label="The route taken — the others become unreachable"]').isVisible()).toBe(false);
      expect(wrapper.get('section[aria-label="Also opens — both paths get walked"]').isVisible()).toBe(true);
      expect(wrapper.get('section[aria-label="Payoff from this route"]').isVisible()).toBe(true);
      expect(wrapper.text()).toContain("→ Testify before the Guild");

      await findButton(wrapper, "Back").trigger("click");
      expect(wrapper.get('section[aria-label="The route taken — the others become unreachable"]').isVisible()).toBe(true);
      expect((radios(wrapper)[0]!.element as HTMLInputElement).checked).toBe(true);
    });

    it("submits the same payload as the desktop path once Advance is pressed from step 2", async () => {
      const wrapper = await mountDialog();
      await radios(wrapper)[0]!.trigger("change");
      await findButton(wrapper, "Continue").trigger("click");

      const advance = findButton(wrapper, "Advance");
      await advance.trigger("click");
      await flush();

      expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({
        campaignId: "campaign-1",
        questId: "quest-1",
        threadId: "thread-a",
        command: "advance",
        edgeId: "edge-1",
        expectedVersion: 4,
        spawnEdgeIds: ["edge-3"],
        holdConsequenceIds: [],
        dispatchLootIds: [],
      }));
      expect(wrapper.emitted("advanced")).toHaveLength(1);
      expect(wrapper.emitted("close")).toHaveLength(1);
    });
  });
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
