import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonForceTick } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), tick: vi.fn(), undo: vi.fn() }));
const forceData = ref<{ steps: unknown[]; ticks: CanonForceTick[]; quests: unknown[] }>({ steps: [], ticks: [], quests: [] });

vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: () => "" } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutate: mocks.update }) }));
vi.mock("@/composables/canon/useCanonForces", async (original) => ({
  ...(await original<typeof import("@/composables/canon/useCanonForces")>()),
  useCanonForceData: () => ({ data: forceData }),
  useTickForce: () => ({ mutate: mocks.tick }),
  useUndoForceTick: () => ({ mutate: mocks.undo }),
}));

vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

import ForceDetail from "./ForceDetail.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";

const tick = (over: Partial<CanonForceTick>): CanonForceTick => ({
  id: "t1", user_id: "u", campaign_id: "c1", force_id: "f1", delta: 1, note: "", session_id: null, step_id: null, world_year: null, world_month: null,
  world_day: null, created_at: "2026-11-19T10:00:00Z", ...over,
});
const force = (over = {}) => canonEntry({ id: "f1", campaign_id: "c1", part: "force", title: "The Stain spreads", wants: "to be forgotten into", clock_size: 6, ...over });

const EntryQuestsStub = { name: "EntryQuests", props: ["entry", "links", "label", "empty"], template: "<div />" };

const mountIt = (entry = force()) =>
  mount(ForceDetail, { props: { entry }, global: { stubs: { ForceSteps: true, EntryQuests: EntryQuestsStub, ConnectionsSection: true, CanonEntryNotes: true, ForceQuestClocks: true } } });

describe("ForceDetail", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    forceData.value = { steps: [], ticks: [], quests: [] };
  });

  it("draws the clock as the sum of this force's ticks only, clamped to its size, never another force's", () => {
    forceData.value.ticks = [tick({ id: "a" }), tick({ id: "b" }), tick({ id: "c", force_id: "other" })];
    expect(mountIt().get("[data-testid=force-clock-tally]").text()).toBe("2 of 6");
    forceData.value.ticks = Array.from({ length: 9 }, (_, i) => tick({ id: `t${i}` }));
    expect(mountIt().get("[data-testid=force-clock-tally]").text()).toBe("6 of 6");
  });

  // Bug caught (#1255 item 8): the force had nowhere to write how to play it, or the notes were bound to another entry.
  it("mounts the notes for this force, labelled as never shown to players", () => {
    const notes = mountIt().getComponent(CanonEntryNotes);
    expect(notes.props("entry")).toMatchObject({ id: "f1" });
    expect(notes.props("help")).toBe("Never shown to players.");
  });

  // Bug caught (#1255 item 20): the force showed nothing of the quest clocks that move it, or listed them for another force.
  it("mounts the quest clocks block for this force", () => {
    expect(mountIt().getComponent({ name: "ForceQuestClocks" }).props("entry")).toMatchObject({ id: "f1" });
  });

  it("ticks forward by one with the note typed beside it, then empties the note", async () => {
    const w = mountIt();
    await w.get("input[aria-label='Why the world moved']").setValue("  The orchards sour ");
    await w.get("[data-testid=tick-forward]").trigger("click");
    expect(mocks.tick).toHaveBeenCalledWith({ campaignId: "c1", forceId: "f1", delta: 1, note: "The orchards sour" });
    expect((w.get("input[aria-label='Why the world moved']").element as HTMLInputElement).value).toBe("");
  });

  it("ticks back by one", async () => {
    forceData.value.ticks = [tick({})];
    await mountIt().get("[data-testid=tick-back]").trigger("click");
    expect(mocks.tick).toHaveBeenCalledWith({ campaignId: "c1", forceId: "f1", delta: -1, note: "" });
  });

  it("cannot tick back from nothing or forward from full, so the log never holds a tick the dial hides", () => {
    expect(mountIt().get("[data-testid=tick-back]").attributes("disabled")).toBeDefined();
    forceData.value.ticks = Array.from({ length: 6 }, (_, i) => tick({ id: `t${i}` }));
    expect(mountIt().get("[data-testid=tick-forward]").attributes("disabled")).toBeDefined();
  });

  it("keeps no ticking controls for a force with no clock", () => {
    const w = mountIt(force({ clock_size: null }));
    expect(w.find("[data-testid=tick-forward]").exists()).toBe(false);
  });

  it("undoes the newest tick by id", async () => {
    forceData.value.ticks = [tick({ id: "old", created_at: "2026-11-18T10:00:00Z" }), tick({ id: "new", created_at: "2026-11-20T10:00:00Z" })];
    await mountIt().get("[data-testid=force-log] button").trigger("click");
    expect(mocks.undo).toHaveBeenCalledWith(expect.objectContaining({ id: "new" }));
  });

  it("saves who and what it wants when a field is left, and a clock size when it is chosen", async () => {
    const w = mountIt();
    await w.get("textarea[aria-label='What it wants']").setValue("the river");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: { wants: "the river" } });
    await w.get("input[aria-label='Who moves']").setValue("The Stain");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: { title: "The Stain" } });
    await w.get("select[aria-label='Clock size']").setValue("8");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: { clock_size: 8 } });
  });

  it("emits delete", async () => {
    const w = mountIt();
    await w.findAll("button").find((b) => b.text() === "Delete this force")!.trigger("click");
    expect(w.emitted("delete")).toHaveLength(1);
  });

  const ended = (over = {}) => force({ closed_as: "stopped", closed_at: "2026-11-23T10:00:00Z", closed_note: "Sift burned the ledger.", ...over });

  // Bug caught (#1255 item 9): a full clock did nothing, so the force had no way to end.
  it("offers the outcomes when the clock is full, and choosing one ends the force", async () => {
    forceData.value.ticks = Array.from({ length: 6 }, (_, i) => tick({ id: `t${i}` }));
    const w = mountIt();
    expect(w.get("[data-testid=force-clock-full]").text()).toContain("The clock is full. What happened?");
    await w.get("[data-testid=force-full-succeeded]").trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: expect.objectContaining({ closed_as: "succeeded", closed_note: null }) });
  });

  it("does not ask what happened while the clock is not full", () => {
    forceData.value.ticks = [tick({ id: "a" })];
    expect(mountIt().find("[data-testid=force-clock-full]").exists()).toBe(false);
  });

  // Bug caught: an ended force with a full clock asked again what happened.
  it("does not ask what happened of a force that has already ended", () => {
    forceData.value.ticks = Array.from({ length: 6 }, (_, i) => tick({ id: `t${i}` }));
    expect(mountIt(ended()).find("[data-testid=force-clock-full]").exists()).toBe(false);
  });

  // Bug caught: End this force wrote the outcome without the DM's note, or without the chosen outcome.
  it("ends the force from the form with the chosen outcome and the note", async () => {
    const w = mountIt();
    await w.get("[data-testid=force-end]").trigger("click");
    const buttons = w.get("[data-testid=force-end-form]").findAll("button");
    await buttons.find((b) => b.text() === "It faded away")!.trigger("click");
    await w.get("[data-testid=force-end-form] input").setValue("Nobody remembered it.");
    await w.get("[data-testid=force-end-form]").trigger("submit");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: expect.objectContaining({ closed_as: "faded", closed_note: "Nobody remembered it." }) });
  });

  // Bug caught: an ended force still ticked forward, moving a world it no longer drives.
  it("shows the ending and disables ticking on an ended force", () => {
    forceData.value.ticks = [tick({ id: "a" })];
    const w = mountIt(ended());
    expect(w.get("[data-testid=force-ended-line]").text()).toBe("Ended: it was stopped");
    expect(w.get("[data-testid=force-ended-note]").text()).toBe("Sift burned the ledger.");
    expect(w.get("[data-testid=tick-forward]").attributes("disabled")).toBeDefined();
    expect(w.get("[data-testid=tick-back]").attributes("disabled")).toBeDefined();
    expect(w.find("[data-testid=force-end]").exists()).toBe(false);
  });

  // Bug caught: Set it moving again left closed_note set, which the table refuses.
  it("sets it moving again by clearing all three columns", async () => {
    const w = mountIt(ended());
    await w.get("[data-testid=force-resume]").trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "f1", patch: { closed_as: null, closed_at: null, closed_note: null } });
  });

  it("leaves the steps frozen only for an ended force", () => {
    expect(mountIt().getComponent({ name: "ForceSteps" }).props("frozen")).toBe(false);
    expect(mountIt(ended()).getComponent({ name: "ForceSteps" }).props("frozen")).toBe(true);
  });

  // Bug caught: the force's quest block listing links of other entries now that the links are the whole campaign's.
  it("hands the quest block this force's links only, in the force's words", () => {
    forceData.value.quests = [{ id: "l1", entry_id: "f1", quest_id: "q1" }, { id: "l2", entry_id: "s9", quest_id: "q1" }];
    const block = mountIt().getComponent(EntryQuestsStub);
    expect(block.props("links")).toEqual([expect.objectContaining({ id: "l1" })]);
    expect(block.props("label")).toBe("Where the party meets it");
  });
});
