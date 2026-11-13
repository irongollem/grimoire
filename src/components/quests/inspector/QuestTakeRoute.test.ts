import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import QuestTakeRoute from "./QuestTakeRoute.vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ mark: vi.fn() }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useMarkQuestMove: () => ({ mutateAsync: mocks.mark, isPending: { value: false } }),
  useQuestConsequences: () => ({ data: ref([
    { id: "r1", on_beat_id: "b", on_edge_id: null, on_beat_outcome: "arrived", action: "grant_knowledge", target_objective_id: null, action_payload: { text: "Learns the code" } },
  ]) }),
  useLootPlacements: () => ({ data: ref([
    { id: "l1", beat_id: "b", label: "Brass key", dispatched_at: null },
    { id: "l2", beat_id: "b", label: "Old coin", dispatched_at: "2026-01-01" },
    { id: "l3", beat_id: "c", label: "Elsewhere", dispatched_at: null },
  ]) }),
}));
vi.mock("@/composables/quests/useQuests", () => ({ useQuestObjectives: () => ({ data: ref([]) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

const edge = (id: string, target: string) => ({ id, quest_id: "q", campaign_id: "camp", source_beat_id: "a", target_beat_id: target, route_kind: "choice" }) as QuestBeatEdge;
const beats = [{ id: "a", title: "Gate" }, { id: "b", title: "Cellar" }, { id: "c", title: "Roof" }] as QuestBeat[];
const staging = { locationId: "loc-9", name: "The Cellar", siteId: null, siteName: null };

function mountTake(props: Record<string, unknown> = {}) {
  return mount(QuestTakeRoute, { props: { edge: edge("e1", "b"), edges: [edge("e1", "b"), edge("e2", "c")], beats, threadId: "t1", targetStaging: staging, ...props } });
}
const box = (wrapper: ReturnType<typeof mountTake>, text: string) => wrapper.findAll("label").find((l) => l.text().includes(text))!.find("input");
const take = (wrapper: ReturnType<typeof mountTake>) => wrapper.findAll("button").find((b) => b.text() === "Take this route")!;

beforeEach(() => { vi.clearAllMocks(); mocks.mark.mockResolvedValue({}); });

describe("QuestTakeRoute", () => {
  it("defaults Party here on and every loot tick off, offering only held loot on the target (fails if a default flips or dispatched/other-beat loot is offered)", () => {
    const wrapper = mountTake();
    expect((box(wrapper, "Party here").element as HTMLInputElement).checked).toBe(true);
    expect((box(wrapper, "Brass key").element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.text()).not.toContain("Old coin");
    expect(wrapper.text()).not.toContain("Elsewhere");
  });

  it("sends the edge, the party flag, the place and the ticked loot", async () => {
    const wrapper = mountTake({ sessionId: "s1" });
    await box(wrapper, "Brass key").setValue(true);
    await take(wrapper).trigger("click");
    expect(mocks.mark).toHaveBeenCalledWith({
      kind: "route", campaignId: "camp", questId: "q", threadId: "t1", sessionId: "s1",
      edgeId: "e1", placeParty: true, dispatchLootIds: ["l1"], movePartyTo: "loc-9",
    });
  });

  it("unticking Party here sends no place, so the party stays put (fails if the place is sent anyway)", async () => {
    const wrapper = mountTake();
    await box(wrapper, "Party here").setValue(false);
    await take(wrapper).trigger("click");
    expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ placeParty: false, movePartyTo: null, dispatchLootIds: [] }));
  });

  it("previews the payoffs and the choices it cuts off", () => {
    const text = mountTake().text();
    expect(text).toContain("Learns the code");
    expect(text).toContain("Roof becomes unreachable");
  });

  it("cannot be taken without a thread", async () => {
    const wrapper = mountTake({ threadId: null });
    expect(take(wrapper).attributes("disabled")).toBeDefined();
    await take(wrapper).trigger("click");
    expect(mocks.mark).not.toHaveBeenCalled();
  });
});
