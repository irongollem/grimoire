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
          { consequence_id: "c1", action: "shift_npc_relationship", target_objective_id: null, target_objective: null, target_npc_id: "npc-1", target_npc: "Ashmouth Guild", target_quest_id: null, target_quest: null, target_document_id: null, target_document: null, target_clock_id: null, target_clock: null, target_location_id: null, target_location: null, target_faction_id: null, target_faction: null, action_payload: { step: -1 }, after_days: 0, on_edge: true },
          { consequence_id: "c2", action: "owe_favor", target_objective_id: null, target_objective: null, target_npc_id: "npc-2", target_npc: "Ser Vallis", target_quest_id: null, target_quest: null, target_document_id: null, target_document: null, target_clock_id: null, target_clock: null, target_location_id: null, target_location: null, target_faction_id: null, target_faction: null, action_payload: { text: "Ser Vallis owes the party" }, after_days: 0, on_edge: false },
        ],
        loot: [{ id: "l1", kind: "currency", label: "80 gp, skimmed", quantity: 80, item_id: null }],
      },
      {
        edge_id: "edge-2", quest_id: "quest-1", beat_id: "beat-watch", beat_title: "Flee the cloister", beat_kind: "combat",
        gate: { mode: "all", is_open: false, conditions: [{ objective_id: "o1", objective: "the guard is dealt with", statuses: ["complete"], current_status: "pending", met: false }] },
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
    expect(wrapper.text()).toContain("Creates Thread B, “C”, at that beat.");
  });

  it("names the #1011 verbs' targets and says when a world payoff is delayed", async () => {
    const context = buildContext();
    context.outgoing[0]!.payoff = [
      { consequence_id: "c3", action: "move_npc", target_objective_id: null, target_objective: null, target_npc_id: "npc-1", target_npc: "Scrim", target_quest_id: null, target_quest: null, target_document_id: null, target_document: null, target_clock_id: null, target_clock: null, target_location_id: "loc-1", target_location: "The Roost", target_faction_id: null, target_faction: null, action_payload: {}, after_days: 3, on_edge: true },
      { consequence_id: "c4", action: "tick_clock", target_objective_id: null, target_objective: null, target_npc_id: null, target_npc: null, target_quest_id: null, target_quest: null, target_document_id: null, target_document: null, target_clock_id: "clock-1", target_clock: "The count", target_location_id: null, target_location: null, target_faction_id: null, target_faction: null, action_payload: { step: 1 }, after_days: 2, on_edge: true },
    ];
    const wrapper = await mountDialog({ context });
    await radios(wrapper)[0]!.trigger("change");

    expect(wrapper.text()).toContain("Scrim moves to The Roost");
    expect(wrapper.text()).toContain("in 3 days");
    expect(wrapper.text()).toContain("The count ticks 1");
    // A clock tick applies inside the transition whatever its stored delay.
    expect(wrapper.text()).not.toContain("in 2 days");
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

    expect(wrapper.text()).toContain("The session moved on another device. Reopen to advance.");
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  // Bug: PostgREST errors are plain objects, not Error instances, so the dialog
  // swallowed the sentence the server raised ("Advance requires a running beat
  // and authored edge") and always showed the generic fallback.
  it("shows the sentence the server raised when the rejection is a PostgREST plain object", async () => {
    mocks.command.mockRejectedValueOnce({ message: "Advance requires a running beat and authored edge", code: "P0001", details: null, hint: null });
    const wrapper = await mountDialog();
    await radios(wrapper)[0]!.trigger("change");
    const advance = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Advance")!;
    await advance.trigger("click");
    await flush();

    expect(wrapper.text()).toContain("Advance requires a running beat and authored edge");
    expect(wrapper.text()).not.toContain("The transition could not be recorded");
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  // Design frame `02 Advance`: below `sm` the modal becomes a full-height sheet
  // with a two-step body. Same `planAdvance` + RPC path either way — only the
  // step index is local, presentational UI state.
  describe("opening, resetting and submitting", () => {
    const advanceBtn = (w: Awaited<ReturnType<typeof mountDialog>>) => w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Advance")!;
    const titleInput = (w: Awaited<ReturnType<typeof mountDialog>>) => w.get("input[placeholder='What just happened?']");

    it("opens on the preselected route, naming it in the header; with nothing preselected the header asks what happened", async () => {
      const preselected = await mountDialog({ preselectedEdgeId: "edge-1" });
      expect(advanceBtn(preselected).props("disabled")).toBe(false);
      expect(preselected.text()).toContain("Testify before the Guild");
      expect((await mountDialog()).findComponent({ name: "ModalHeader" }).props("title")).toBe("Choose what happened");
    });

    it("reopening on a phone starts again at step 1", async () => {
      mocks.isMobile.value = true;
      const wrapper = await mountDialog({ preselectedEdgeId: "edge-1" });
      await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Continue")!.trigger("click");
      expect(wrapper.get('section[aria-label="The route taken: the others become unreachable"]').isVisible()).toBe(false);
      await wrapper.setProps({ open: false });
      await wrapper.setProps({ open: true });
      expect(wrapper.get('section[aria-label="The route taken: the others become unreachable"]').isVisible()).toBe(true);
    });

    it("says 'this beat' when the session has no current beat to name", async () => {
      const context = buildContext();
      context.current = null;
      mocks.isMobile.value = true;
      expect((await mountDialog({ context })).text()).toContain("Leaving “this beat”");
    });

    it("opens straight onto the improvise option when asked to", async () => {
      const wrapper = await mountDialog({ improvise: true, preselectedEdgeId: "edge-1" });
      expect((radios(wrapper).at(-1)!.element as HTMLInputElement).checked).toBe(true);
      expect(advanceBtn(wrapper).props("disabled")).toBe(true);
    });

    it("reopening starts clean: nothing typed, the improvise defaults back, and a closed parallel route stays unticked", async () => {
      const context = buildContext();
      context.outgoing.push({
        edge_id: "edge-4", quest_id: "quest-1", beat_id: "beat-locked", beat_title: "The locked vault", beat_kind: "explore",
        gate: { mode: "all", is_open: false, conditions: [{ objective_id: "o1", objective: "the key is found", statuses: ["complete"], current_status: "pending", met: false }] },
        effects: [], route_kind: "parallel", thread_label: "D", converge_mode: "any", site: null, payoff: [], loot: [],
      });
      const wrapper = await mountDialog({ context, improvise: true });
      await titleInput(wrapper).setValue("A goat is sacrificed");
      await wrapper.setProps({ open: false });
      await wrapper.setProps({ open: true, improvise: false, preselectedEdgeId: "edge-1" });
      await wrapper.vm.$nextTick();
      await advanceBtn(wrapper).trigger("click");
      await flush();
      expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ edgeId: "edge-1", spawnEdgeIds: ["edge-3"] }));

      await wrapper.setProps({ open: false });
      await wrapper.setProps({ open: true, improvise: true, preselectedEdgeId: null });
      await wrapper.vm.$nextTick();
      expect((titleInput(wrapper).element as HTMLInputElement).value).toBe("");
      await titleInput(wrapper).setValue("A new twist");
      await advanceBtn(wrapper).trigger("click");
      await flush();
      expect(mocks.improvise).toHaveBeenCalledWith(expect.objectContaining({ pushReturn: true, keepEdge: false }));
    });

    it("an improvised beat is sent with its details trimmed and its two choices as set", async () => {
      const wrapper = await mountDialog({ improvise: true });
      await titleInput(wrapper).setValue("  They bribe the guard  ");
      await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Add details")!.trigger("click");
      await wrapper.get("input[placeholder='One-line DM note']").setValue("  Two gold  ");
      await wrapper.get("input[placeholder='Player reveal copy']").setValue("  The guard looks away  ");
      const boxes = wrapper.findAll("input[type=checkbox]");
      const keep = boxes.find((b) => b.element.parentElement?.textContent?.includes("Keep an")) ?? boxes.at(-1)!;
      await keep.setValue(true);
      await advanceBtn(wrapper).trigger("click");
      await flush();
      expect(mocks.improvise).toHaveBeenCalledWith(expect.objectContaining({
        title: "They bribe the guard", dmLead: "Two gold", revealText: "The guard looks away", keepEdge: true, pushReturn: true,
      }));
    });

    it("the header carries the improvised title trimmed, and a title of spaces keeps Advance off", async () => {
      const wrapper = await mountDialog({ improvise: true });
      const header = () => wrapper.findComponent({ name: "ModalHeader" }).props("title");
      expect(header()).toBe("Something else happened");
      await titleInput(wrapper).setValue("   ");
      expect(header()).toBe("Something else happened");
      expect(advanceBtn(wrapper).props("disabled")).toBe(true);
      await titleInput(wrapper).trigger("keyup.enter");
      await flush();
      expect(mocks.improvise).not.toHaveBeenCalled();
      await titleInput(wrapper).setValue("  Goat  ");
      expect(header()).toBe("Goat");
    });

    it("pressing Enter twice while the first submit is still going sends it once", async () => {
      let finish: (v: unknown) => void = () => {};
      mocks.improvise.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
      const wrapper = await mountDialog({ improvise: true });
      await titleInput(wrapper).setValue("A goat");
      await titleInput(wrapper).trigger("keyup.enter");
      await titleInput(wrapper).trigger("keyup.enter");
      finish({ context: buildContext(), beat: {} });
      await flush();
      expect(mocks.improvise).toHaveBeenCalledTimes(1);
    });

    it("a failed transition says so plainly, frees Advance, and keeps the dialog open for a retry", async () => {
      mocks.command.mockRejectedValueOnce({ message: "permission denied for table x", code: "42501" }).mockResolvedValue(buildContext());
      const wrapper = await mountDialog({ preselectedEdgeId: "edge-1" });
      await advanceBtn(wrapper).trigger("click");
      await flush();
      expect(wrapper.text()).toContain("The transition could not be recorded");
      expect(advanceBtn(wrapper).props("loading")).toBe(false);
      expect(wrapper.emitted("close")).toBeUndefined();
      await advanceBtn(wrapper).trigger("click");
      await flush();
      expect(wrapper.emitted("advanced")).toHaveLength(1);
    });

    it("loot ticked for one route is not carried over when the DM picks again", async () => {
      const wrapper = await mountDialog({ preselectedEdgeId: "edge-1" });
      const lootBox = () => wrapper.get('section[aria-label="Payoff from this route"]').findAll("input[type=checkbox]").at(-1)!;
      await lootBox().setValue(true);
      await radios(wrapper).at(-1)!.trigger("change");
      await radios(wrapper)[0]!.trigger("change");
      await advanceBtn(wrapper).trigger("click");
      await flush();
      expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ dispatchLootIds: [] }));
    });

    it("tells a handout payoff by the document's name, and a parallel site by its spaces (grounds for a wood)", async () => {
      const context = buildContext();
      context.outgoing[0]!.payoff = [
        { consequence_id: "c5", action: "give_handout", target_objective_id: null, target_objective: null, target_npc_id: null, target_npc: null, target_quest_id: null, target_quest: null, target_document_id: "d1", target_document: "The smuggler's map", target_clock_id: null, target_clock: null, target_location_id: null, target_location: null, target_faction_id: null, target_faction: null, action_payload: {}, after_days: 0, on_edge: true },
      ];
      const wrapper = await mountDialog({ context });
      expect(wrapper.text()).toContain("site · 3 rooms");
      await radios(wrapper)[0]!.trigger("change");
      expect(wrapper.text()).toContain("The party receives The smuggler's map");

      const wild = buildContext();
      wild.outgoing[2]!.site = { location_id: "loc-1", name: "The Thornwood", room_count: 3, location_type: "wilds" };
      expect((await mountDialog({ context: wild })).text()).toContain("site · 3 grounds");
      const one = buildContext();
      one.outgoing[2]!.site = { location_id: "loc-1", name: "The Thornwood", room_count: 1, location_type: "wilds" };
      expect((await mountDialog({ context: one })).text()).toContain("site · 1 ground");
    });
  });

  describe("below sm", () => {
    beforeEach(() => {
      mocks.isMobile.value = true;
    });

    function findButton(wrapper: Awaited<ReturnType<typeof mountDialog>>, label: string) {
      return wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!;
    }

    it("step 1 shows only the route section, with Continue disabled until a route is chosen", async () => {
      const wrapper = await mountDialog();
      expect(wrapper.get('section[aria-label="The route taken: the others become unreachable"]').isVisible()).toBe(true);
      expect(wrapper.get('section[aria-label="Also opens: both paths get walked"]').isVisible()).toBe(false);
      expect(wrapper.text()).toContain("Leaving “Confront Ser Vallis”");

      expect(findButton(wrapper, "Continue").props("disabled")).toBe(true);
      await radios(wrapper)[0]!.trigger("change");
      expect(findButton(wrapper, "Continue").props("disabled")).toBe(false);
    });

    it("Continue moves to step 2, and Back returns to step 1 keeping the chosen route", async () => {
      const wrapper = await mountDialog();
      await radios(wrapper)[0]!.trigger("change");
      await findButton(wrapper, "Continue").trigger("click");

      expect(wrapper.get('section[aria-label="The route taken: the others become unreachable"]').isVisible()).toBe(false);
      expect(wrapper.get('section[aria-label="Also opens: both paths get walked"]').isVisible()).toBe(true);
      expect(wrapper.get('section[aria-label="Payoff from this route"]').isVisible()).toBe(true);
      expect(wrapper.text()).toContain("→ Testify before the Guild");

      await findButton(wrapper, "Back").trigger("click");
      expect(wrapper.get('section[aria-label="The route taken: the others become unreachable"]').isVisible()).toBe(true);
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
