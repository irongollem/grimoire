import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import QuestTakeRoute from "./QuestTakeRoute.vue";
import type { ThreadStanding } from "@/lib/quests/moves";
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

const atGate: ThreadStanding = { partyBeatId: "a", reachedBeatIds: new Set(["a"]), entryBeatId: "a" };
function mountTake(props: Record<string, unknown> = {}) {
  return mount(QuestTakeRoute, { props: { edge: edge("e1", "b"), edges: [edge("e1", "b"), edge("e2", "c")], beats, standing: atGate, threadId: "t1", targetStaging: staging, ...props } });
}
const box = (wrapper: ReturnType<typeof mountTake>, text: string) => wrapper.findAll("label").find((l) => l.text().includes(text))!.find("input");
const take = (wrapper: ReturnType<typeof mountTake>) => wrapper.findAll("button").find((b) => b.text() === "Take this route" || b.text() === "Mark as taken")!;

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
      edgeId: "e1", via: ["a"], placeParty: true, dispatchLootIds: ["l1"], movePartyTo: "loc-9",
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

  describe("where the party stands (#1194)", () => {
    // Gate -> Kennels/Tunnel -> Lodge -> Vault; the route under test leaves the Lodge.
    const lodgeEdges = [
      { ...edge("k", "kennels"), source_beat_id: "a" }, { ...edge("k2", "lodge"), source_beat_id: "kennels" },
      { ...edge("t", "tunnel"), source_beat_id: "a" }, { ...edge("t2", "lodge"), source_beat_id: "tunnel" },
      { ...edge("go", "vault"), source_beat_id: "lodge" },
    ];
    const lodgeBeats = [{ id: "a", title: "Gate" }, { id: "kennels", title: "Kennels" }, { id: "tunnel", title: "Tunnel" }, { id: "lodge", title: "Lodge" }, { id: "vault", title: "Vault" }] as QuestBeat[];
    const ahead = (edges = lodgeEdges) => mountTake({ edge: edges.at(-1), edges, beats: lodgeBeats });

    it("from further back the button reads Mark as taken and names what it fills in on the way", () => {
      const wrapper = mountTake({ edge: lodgeEdges[4], edges: lodgeEdges.filter((e) => e.id !== "t" && e.id !== "t2"), beats: lodgeBeats });
      expect(take(wrapper).text()).toBe("Mark as taken");
      expect(wrapper.find("[data-on-the-way]").text()).toBe("Marks Kennels, Lodge done on the way");
      expect(wrapper.find("input[type=radio]").exists()).toBe(false);
    });

    it("with one way it sends that way without asking (fails if via is left to the server's guess)", async () => {
      const wrapper = mountTake({ edge: lodgeEdges[4], edges: lodgeEdges.filter((e) => e.id !== "t" && e.id !== "t2"), beats: lodgeBeats });
      await take(wrapper).trigger("click");
      expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ edgeId: "go", via: ["a", "kennels", "lodge"] }));
    });

    it("with two ways it lists them, stays disabled until one is picked and then sends exactly that way", async () => {
      const wrapper = ahead();
      const radios = wrapper.findAll("input[type=radio]");
      expect(radios).toHaveLength(2);
      expect(wrapper.text()).toContain("Tunnel, Lodge");
      expect(wrapper.text()).toContain("Kennels, Lodge");
      expect(take(wrapper).attributes("disabled")).toBeDefined();
      await take(wrapper).trigger("click");
      expect(mocks.mark).not.toHaveBeenCalled();
      await wrapper.findAll("label").find((l) => l.text() === "Kennels, Lodge")!.find("input").setValue(true);
      expect(take(wrapper).attributes("disabled")).toBeUndefined();
      await take(wrapper).trigger("click");
      expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ via: ["a", "kennels", "lodge"] }));
    });

    it("past or cut off: greyed out with the reason, and it sends nothing", async () => {
      const wrapper = mountTake({ standing: { partyBeatId: "c", reachedBeatIds: new Set(["a", "b", "c"]), entryBeatId: "a" } });
      expect(wrapper.find("[data-past-reason]").text()).toBe("Already taken");
      expect(take(wrapper).attributes("disabled")).toBeDefined();
      await take(wrapper).trigger("click");
      expect(mocks.mark).not.toHaveBeenCalled();
      const cut = mountTake({ edge: edge("z", "b"), edges: [edge("e1", "b")], standing: { partyBeatId: "c", reachedBeatIds: new Set(["c"]), entryBeatId: "a" } });
      expect(cut.find("[data-past-reason]").text()).toBe("Cut off by an earlier choice");
    });
  });
});
