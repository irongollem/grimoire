import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: ref([{ id: "a", title: "The gate" }, { id: "b", title: "The cellar" }, { id: "c", title: "The roof" }] as QuestBeat[]) }),
  useQuestBeatEdges: () => ({ data: edgesRef }),
  useQuestBeatEdgeGates: () => ({ data: ref([]), isSuccess: ref(true), refetch: m.refetchGates }),
  useQuestConsequences: () => ({ data: ref([]) }),
  useUpdateQuestBeatEdge: () => ({ mutateAsync: m.update }),
  useSetQuestRouteGate: () => ({ mutateAsync: m.setGate }),
  useDeleteQuestBeatEdge: () => ({ mutateAsync: m.del }),
  useMarkQuestMove: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useLootPlacements: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/quests/useQuests", () => ({ useQuestObjectives: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: m.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

function mountColumn(edgeId = "e1") {
  return mount(QuestRouteColumn, { props: { questId: "q", edgeId } });
}
const button = (w: ReturnType<typeof mountColumn>, text: string) => w.findAll("button").find((b) => b.text() === text)!;
const input = (w: ReturnType<typeof mountColumn>, placeholder: string) => w.find(`input[placeholder="${placeholder}"]`);

beforeEach(() => {
  vi.clearAllMocks();
  edgesRef.value = [edge({ id: "e1" }), edge({ id: "e2", target_beat_id: "c" })];
  m.update.mockResolvedValue({});
  m.setGate.mockResolvedValue(undefined);
  m.refetchGates.mockResolvedValue({});
  m.del.mockResolvedValue(undefined);
  m.confirm.mockResolvedValue(true);
});

describe("QuestRouteColumn", () => {
  it("saves the label and the cost, and a blank label as null rather than an empty string", async () => {
    const w = mountColumn();
    await input(w, "Take Naerth's deal").setValue("  Take the deal ");
    await input(w, "His son goes free; the family loses its boats.").setValue("The boats");
    await button(w, "Save route").trigger("click");
    await flushPromises();
    expect(m.update).toHaveBeenCalledWith({ id: "e1", questId: "q", update: { route_kind: "choice", label: "Take the deal", note: "The boats" } });

    await input(w, "Take Naerth's deal").setValue("   ");
    await input(w, "His son goes free; the family loses its boats.").setValue("");
    await button(w, "Save route").trigger("click");
    await flushPromises();
    expect(m.update).toHaveBeenLastCalledWith({ id: "e1", questId: "q", update: { route_kind: "choice", label: null, note: null } });
  });

  it("refuses 'And also' when the beat has no other choice route, and says why instead of saving", async () => {
    edgesRef.value = [edge({ id: "e1" })];
    const w = mountColumn();
    expect(button(w, "And also").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("no other choice route");
    // A parallel route already saved as parallel stays selectable and saveable.
    edgesRef.value = [edge({ id: "e1", route_kind: "parallel", label: "Scout" })];
    expect(button(mountColumn(), "And also").attributes("disabled")).toBeUndefined();
  });

  it("will not save an 'And also' route without a label, since the label names its thread", async () => {
    const w = mountColumn();
    await button(w, "And also").trigger("click");
    await button(w, "Save route").trigger("click");
    await flushPromises();
    expect(m.update).not.toHaveBeenCalled();
    expect(w.find("[role=alert]").text()).toContain("names the thread");
  });

  it("refuses to save 'And also' when the other choice route vanished (deleted live) after it was picked", async () => {
    const w = mountColumn();
    await input(w, "Take Naerth's deal").setValue("Scout ahead");
    await button(w, "And also").trigger("click");
    edgesRef.value = [edge({ id: "e1" })];
    await flushPromises();
    await button(w, "Save route").trigger("click");
    await flushPromises();
    expect(m.update).not.toHaveBeenCalled();
    expect(w.find("[role=alert]").text()).toContain("no other choice route");
  });

  it("re-seeds when another route is selected, but not when its own save refetches the row", async () => {
    edgesRef.value = [edge({ id: "e1", label: "First" }), edge({ id: "e2", label: "Second", target_beat_id: "c" })];
    const w = mountColumn("e1");
    expect((input(w, "Take Naerth's deal").element as HTMLInputElement).value).toBe("First");
    await input(w, "Take Naerth's deal").setValue("Typing on");
    // The echo of a save: same route, row replaced by a fresh object.
    edgesRef.value = [edge({ id: "e1", label: "First" }), edgesRef.value[1]!];
    await flushPromises();
    expect((input(w, "Take Naerth's deal").element as HTMLInputElement).value).toBe("Typing on");
    await w.setProps({ edgeId: "e2" });
    expect((input(w, "Take Naerth's deal").element as HTMLInputElement).value).toBe("Second");
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
