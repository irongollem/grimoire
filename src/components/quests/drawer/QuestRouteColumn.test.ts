import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import QuestRouteColumn from "./QuestRouteColumn.vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const edge = (over: Partial<QuestBeatEdge>) => ({
  id: "e1", quest_id: "q", campaign_id: "c", source_beat_id: "a", target_beat_id: "b", route_kind: "choice",
  label: null, note: null, gate_mode: "all", ...over,
}) as QuestBeatEdge;

const m = vi.hoisted(() => ({
  update: vi.fn(), setGate: vi.fn(), del: vi.fn(), confirm: vi.fn(), refetchGates: vi.fn(),
}));
const edgesRef = ref<QuestBeatEdge[]>([]);
const gatesRef = ref<unknown[]>([]);
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: ref([{ id: "a", title: "The gate" }, { id: "b", title: "The cellar" }, { id: "c", title: "The roof" }] as QuestBeat[]) }),
  useQuestBeatEdges: () => ({ data: edgesRef }),
  useQuestBeatEdgeGates: () => ({ data: gatesRef, isSuccess: ref(true), refetch: m.refetchGates }),
  useQuestConsequences: () => ({ data: ref([]) }),
  useUpdateQuestBeatEdge: () => ({ mutateAsync: m.update }),
  useSetQuestRouteGate: () => ({ mutateAsync: m.setGate }),
  useDeleteQuestBeatEdge: () => ({ mutateAsync: m.del }),
  useMarkQuestMove: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useLootPlacements: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/quests/useQuests", () => ({ useQuestObjectives: () => ({ data: ref([{ id: "o1", description: "Find the ledger", status: "pending" }, { id: "o2", description: "Keep trust", status: "pending" }]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: m.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

function mountColumn(edgeId = "e1") {
  return mount(QuestRouteColumn, { props: { questId: "q", edgeId, standing: null } });
}
const button = (w: ReturnType<typeof mountColumn>, text: string) => w.findAll("button").find((b) => b.text() === text)!;
const input = (w: ReturnType<typeof mountColumn>, placeholder: string) => w.find(`input[placeholder="${placeholder}"]`);

const settle = async () => { await vi.advanceTimersByTimeAsync(2500); await flushPromises(); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  edgesRef.value = [edge({ id: "e1" }), edge({ id: "e2", target_beat_id: "c" })];
  gatesRef.value = [];
  m.update.mockResolvedValue({});
  m.setGate.mockResolvedValue(undefined);
  m.refetchGates.mockResolvedValue({});
  m.del.mockResolvedValue(undefined);
  m.confirm.mockResolvedValue(true);
});

describe("QuestRouteColumn", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("autosaves the label and the cost with no Save button, and a blank label as null rather than an empty string", async () => {
    const w = mountColumn();
    expect(w.findAll("button").some((b) => b.text() === "Save route")).toBe(false);
    await input(w, "Take Naerth's deal").setValue("  Take the deal ");
    await input(w, "His son goes free; the family loses its boats.").setValue("The boats");
    await settle();
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith({ id: "e1", questId: "q", update: { route_kind: "choice", label: "Take the deal", note: "The boats" } });
    expect(w.text()).toContain("Saved");

    await input(w, "Take Naerth's deal").setValue("   ");
    await input(w, "His son goes free; the family loses its boats.").setValue("");
    await settle();
    expect(m.update).toHaveBeenLastCalledWith({ id: "e1", questId: "q", update: { route_kind: "choice", label: null, note: null } });
  });

  it("pauses while a gate condition is incomplete and saves once it is completed", async () => {
    const w = mountColumn();
    await w.findAll("button").find((b) => b.text() === "Add condition")!.trigger("click");
    await settle();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.setGate).not.toHaveBeenCalled();
    expect(w.text()).toContain("Autosave paused until the condition is complete");
    w.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "o1");
    await settle();
    expect(m.setGate).toHaveBeenCalledWith({ edgeId: "e1", questId: "q", mode: "all", conditions: [{ objectiveId: "o1", statuses: ["complete"] }] });
  });

  it("greys 'And also' until the route has a label and the beat has another choice route", async () => {
    edgesRef.value = [edge({ id: "e1" })];
    const w = mountColumn();
    await input(w, "Take Naerth's deal").setValue("Scout ahead");
    expect(button(w, "And also").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("no other choice route");
    edgesRef.value = [edge({ id: "e1" }), edge({ id: "e2", target_beat_id: "c" })];
    const w2 = mountColumn();
    expect(button(w2, "And also").attributes("disabled")).toBeDefined();
    await input(w2, "Take Naerth's deal").setValue("Scout ahead");
    expect(button(w2, "And also").attributes("disabled")).toBeUndefined();
    await button(w2, "And also").trigger("click");
    await settle();
    expect(m.update).toHaveBeenCalledWith({ id: "e1", questId: "q", update: { route_kind: "parallel", label: "Scout ahead", note: null } });
  });

  it("never writes an invalid 'And also': clearing the label of a saved one pauses and keeps the last valid save", async () => {
    edgesRef.value = [edge({ id: "e1", route_kind: "parallel", label: "Scout" }), edge({ id: "e2", target_beat_id: "c" })];
    const w = mountColumn();
    await input(w, "Take Naerth's deal").setValue("");
    await settle();
    expect(m.update).not.toHaveBeenCalled();
    expect(w.text()).toContain("Autosave paused until this route has a label");
  });

  it("does not save 'And also' when the other choice route vanished (deleted live) after it was picked", async () => {
    const w = mountColumn();
    await input(w, "Take Naerth's deal").setValue("Scout ahead");
    await button(w, "And also").trigger("click");
    await settle();
    m.update.mockClear();
    edgesRef.value = [edge({ id: "e1" })];
    await input(w, "His son goes free; the family loses its boats.").setValue("A cost");
    await settle();
    expect(m.update).not.toHaveBeenCalled();
    expect(w.text()).toContain("Autosave paused until this beat has another choice route");
  });

  it("does not overwrite typing with the refetch echo of its own save", async () => {
    const w = mountColumn();
    await input(w, "Take Naerth's deal").setValue("Take the deal");
    await settle();
    await input(w, "Take Naerth's deal").setValue("Take the deal, but ");
    // The echo of the save: same route, row replaced by a normalised object.
    edgesRef.value = [edge({ id: "e1", label: "Take the deal" }), edgesRef.value[1]!];
    await flushPromises();
    expect((input(w, "Take Naerth's deal").element as HTMLInputElement).value).toBe("Take the deal, but ");
  });

  it("flushes a pending edit to the route it was typed into when another route is selected, then shows the new route's own values", async () => {
    edgesRef.value = [edge({ id: "e1", label: "First" }), edge({ id: "e2", label: "Second", target_beat_id: "c" })];
    const w = mountColumn("e1");
    await input(w, "Take Naerth's deal").setValue("First, edited");
    await w.setProps({ edgeId: "e2" });
    await flushPromises();
    expect(m.update).toHaveBeenCalledWith({ id: "e1", questId: "q", update: { route_kind: "choice", label: "First, edited", note: null } });
    expect((input(w, "Take Naerth's deal").element as HTMLInputElement).value).toBe("Second");
    await settle();
    expect(m.update).toHaveBeenCalledTimes(1);
  });

  it("emits deleted only once the delete succeeded, and not when the confirm is declined", async () => {
    const w = mountColumn();
    m.confirm.mockResolvedValueOnce(false);
    await button(w, "Delete route").trigger("click");
    await flushPromises();
    expect(m.del).not.toHaveBeenCalled();
    expect(w.emitted("deleted")).toBeUndefined();

    m.del.mockRejectedValueOnce(new Error("boom"));
    await button(w, "Delete route").trigger("click");
    await flushPromises();
    expect(w.emitted("deleted")).toBeUndefined();
    expect(w.find("[role=alert]").text()).toContain("boom");

    await button(w, "Delete route").trigger("click");
    await flushPromises();
    expect(w.emitted("deleted")).toHaveLength(1);
  });

  it("heads the column with the label, else 'To <target>', and links back to the source beat", async () => {
    const w = mountColumn();
    expect(w.find("h3").text()).toBe("To The cellar");
    edgesRef.value = [edge({ id: "e1", label: "Take the deal" })];
    await flushPromises();
    expect(w.find("h3").text()).toBe("Take the deal");
    await button(w, "The gate").trigger("click");
    expect(w.emitted("select-beat")).toEqual([["a"]]);
    await w.find("button[aria-label='Back to the quest']").trigger("click");
    expect(w.emitted("deselect")).toHaveLength(1);
  });
});
