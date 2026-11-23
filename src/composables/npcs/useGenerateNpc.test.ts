import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { GenerateNpcRequest, NpcGenerateForm } from "./useGenerateNpc";
import { kinInsertFor, personKey } from "@/lib/kinship/keys";
import { ASSOCIATE_CHOICES, DEFAULT_ASSOCIATE } from "@/lib/npcGenerator/associate";

const mocks = vi.hoisted(() => ({
  createNpc: vi.fn(),
  generate: vi.fn(),
  addFactionNpc: vi.fn(),
  createConnection: vi.fn(),
  createKinLink: vi.fn(),
  addInventory: vi.fn(),
  refetchPacks: vi.fn(),
  logImage: vi.fn(),
}));
const busy = ref(false);
const genError = ref<string | null>(null);

vi.mock("@/composables/npcs/useNpcs", () => ({ useCreateNpcInCampaign: () => ({ mutateAsync: mocks.createNpc }) }));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({ useImageGenerationLog: () => ({ logImageGeneration: mocks.logImage }) }));
vi.mock("@/composables/kinship/useKinLinks", () => ({ useCreateKinLinkInCampaign: () => ({ mutateAsync: mocks.createKinLink }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAddFactionNpc: () => ({ mutateAsync: mocks.addFactionNpc }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.createConnection }) }));
vi.mock("@/composables/items/useNpcInventory", () => ({ useAddNpcInventoryItemInCampaign: () => ({ mutateAsync: mocks.addInventory }) }));
vi.mock("@/composables/npcs/useNpcStarterPacks", () => ({ useNpcStarterPacks: () => ({ refetch: mocks.refetchPacks }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (_e: unknown, fallback?: string) => fallback ?? "boom" }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    activeCampaignId: "c1",
    activeCampaign: { calendar_id: null, custom_calendar: null },
    todayYear: 1495, todayMonth: 1, todayDay: 1,
  }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/ai/useNpcGeneration", () => ({
  useNpcGeneration: () => ({ error: genError, concept: ref(""), clearCompleted: vi.fn(), generate: mocks.generate }),
  toTiptapJson: (text: string) => ({ type: "doc", content: [{ type: "text", text }] }),
}));

const { useGenerateNpc, buildNpcAiContext } = await import("./useGenerateNpc");

const form: NpcGenerateForm = {
  name: "", race: "", alignment: "", relationship: "unknown", templateId: "auto",
  location_id: null, faction_id: null, faction_role: "Member", related_npc_id: null,
  related_npc_tie: DEFAULT_ASSOCIATE, related_npc_kin: null, related_pc_id: null, second_parent: null,
};
const request = (over: Partial<GenerateNpcRequest> = {}): GenerateNpcRequest => ({
  concept: "A baker", prompt: "A baker", context: "", generateAlterEgo: false, generateImage: true,
  form, locationId: null, inventoryItems: [], associate: null, ...over,
});
const generated = (over: Record<string, unknown> = {}) => ({
  name: "Mira", race: "human", alignment: "neutral", age: "30", occupation: "baker", appearance: "", personality: "",
  voice: "", backstory: "", notes: "", status: "alive", relationship: "unknown", tags: [],
  portrait_url: "https://img/p.webp", disguise_portrait_url: null, ...over,
});

describe("useGenerateNpc", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    busy.value = false;
    genError.value = null;
    mocks.refetchPacks.mockResolvedValue({ isError: false, data: [{ id: "everyday", label: "x", cues: [], items: [] }] });
    mocks.createNpc.mockResolvedValue({ id: "npc-1" });
    mocks.generate.mockResolvedValue(generated());
  });

  it("a failed portrait leaves the NPC saved and says only the portrait failed", async () => {
    mocks.generate.mockResolvedValue(generated({ portrait_url: null }));
    const outcome = await useGenerateNpc().generateAndCreateNpc(request());
    expect(mocks.createNpc).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ id: "npc-1", name: "Mira", stage: "saved", portrait: "failed", error: null });
    expect(mocks.logImage).not.toHaveBeenCalled();
  });

  it("reports a portrait nobody asked for as none, not failed", async () => {
    mocks.generate.mockResolvedValue(generated({ portrait_url: null }));
    const outcome = await useGenerateNpc().generateAndCreateNpc(request({ generateImage: false }));
    expect(outcome.portrait).toBe("none");
  });

  it("starts nothing while another generation is running", async () => {
    busy.value = true;
    const outcome = await useGenerateNpc().generateAndCreateNpc(request());
    expect(outcome).toMatchObject({ id: null, stage: "prepare", error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("generates nothing, and so charges nothing, when the starter packs cannot be read", async () => {
    mocks.refetchPacks.mockResolvedValue({ isError: true, data: undefined, error: new Error("offline") });
    const outcome = await useGenerateNpc().generateAndCreateNpc(request());
    expect(outcome).toMatchObject({ id: null, stage: "prepare" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("creates no row when generation fails and hands back the message the panel shows", async () => {
    genError.value = "Provider down";
    mocks.generate.mockResolvedValue(null);
    const outcome = await useGenerateNpc().generateAndCreateNpc(request());
    expect(outcome).toMatchObject({ id: null, stage: "generate", error: "Provider down" });
    expect(mocks.createNpc).not.toHaveBeenCalled();
  });

  it("lets a failed save throw, so the panel can turn a quota race into its paywall", async () => {
    mocks.createNpc.mockRejectedValue(new Error("quota_exceeded"));
    await expect(useGenerateNpc().generateAndCreateNpc(request())).rejects.toThrow("quota_exceeded");
  });

  it("keeps the saved NPC when a tie or the starter items fail, and reports each", async () => {
    mocks.addFactionNpc.mockRejectedValue(new Error("nope"));
    mocks.addInventory.mockRejectedValue(new Error("nope"));
    mocks.refetchPacks.mockResolvedValue({ isError: false, data: [{ id: "everyday", label: "x", cues: [], items: ["Coin purse"] }] });
    const outcome = await useGenerateNpc().generateAndCreateNpc(request({ form: { ...form, faction_id: "f1" } }));
    expect(outcome.id).toBe("npc-1");
    expect(outcome.linkErrors).toHaveLength(1);
    expect(outcome.inventoryError).not.toBeNull();
  });
});

describe("useGenerateNpc ties an Ask-made NPC into the campaign", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    busy.value = false;
    genError.value = null;
    mocks.refetchPacks.mockResolvedValue({ isError: false, data: [{ id: "everyday", label: "x", cues: [], items: [] }] });
    mocks.createNpc.mockResolvedValue({ id: "npc-1" });
    mocks.generate.mockResolvedValue(generated());
  });

  it("writes the kin link from the new NPC to the related one, and the other parent too", async () => {
    const outcome = await useGenerateNpc().generateAndCreateNpc(request({
      form: { ...form, related_npc_id: "n-brenna", related_npc_kin: "child", second_parent: "npc:n-odo" },
    }));
    expect(outcome.linkErrors).toEqual([]);
    expect(mocks.createKinLink).toHaveBeenCalledTimes(2);
    const inputs = mocks.createKinLink.mock.calls.map(([arg]) => arg.input);
    // "Wren is the child of Brenna and Odo": a parent link from each parent to the new NPC.
    expect(inputs).toEqual([
      kinInsertFor(personKey("npc", "npc-1"), "child", personKey("npc", "n-brenna")),
      kinInsertFor(personKey("npc", "npc-1"), "child", personKey("npc", "n-odo")),
    ]);
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it("writes a world link from the new NPC to a related NPC with the chosen tie", async () => {
    const betrayed = ASSOCIATE_CHOICES.find((c) => c.key === "betrayed" && c.subjectIsFrom);
    if (!betrayed) throw new Error("catalogue lost betrayed");
    await useGenerateNpc().generateAndCreateNpc(request({
      form: { ...form, related_npc_id: "n-smuggler", related_npc_tie: betrayed },
      associate: { id: "n-smuggler", name: "Smuggler" },
    }));
    expect(mocks.createConnection).toHaveBeenCalledWith({
      input: { subject: { kind: "npc", id: "npc-1" }, other: { kind: "npc", id: "n-smuggler", name: "Smuggler" }, choice: betrayed },
      campaignId: "c1",
    });
    expect(mocks.createKinLink).not.toHaveBeenCalled();
  });

  it("writes a world link to a party member, not an NPC, when a character is the associate", async () => {
    await useGenerateNpc().generateAndCreateNpc(request({
      form: { ...form, related_pc_id: "pc-1" },
      associate: { id: "pc-1", name: "Thorne" },
    }));
    expect(mocks.createConnection.mock.calls[0][0].input.other).toEqual({ kind: "party_member", id: "pc-1", name: "Thorne" });
  });

  it("reports a tie to a person who is no longer there instead of linking nobody", async () => {
    const outcome = await useGenerateNpc().generateAndCreateNpc(request({ form: { ...form, related_npc_id: "gone" }, associate: null }));
    expect(outcome.linkErrors).toEqual(["the selected associate is no longer in this campaign"]);
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it("seats the NPC in the faction under the role the form carries", async () => {
    await useGenerateNpc().generateAndCreateNpc(request({ form: { ...form, faction_id: "f1", faction_role: "Spy" } }));
    expect(mocks.addFactionNpc).toHaveBeenCalledWith({ faction_id: "f1", npc_id: "npc-1", role: "Spy" });
  });
});

describe("buildNpcAiContext", () => {
  const sources = {
    locations: [{ id: "l1", name: "Harrow", player_summary: "A mining town." }],
    factions: [{ id: "f1", name: "Guild", faction_type: "trade" }],
    npcs: [], party: [], todayYear: 1495,
  };

  it("names only a place and faction the campaign has, and a stray id adds nothing", () => {
    const text = buildNpcAiContext({ ...form, faction_id: "gone" }, "l1", [], sources);
    expect(text).toContain("Location: Harrow");
    expect(text).toContain("Location summary: A mining town.");
    expect(text).not.toContain("Faction");
    expect(buildNpcAiContext(form, "elsewhere", [], sources)).not.toContain("Location");
  });

  it("names a related NPC with their birth year, so the model gives kin ages that fit", () => {
    const text = buildNpcAiContext({ ...form, related_npc_id: "n1", related_npc_kin: "sibling" }, null, [], {
      ...sources, npcs: [{ id: "n1", name: "Perf", born_year: 1450 }],
    });
    expect(text).toContain("The new NPC is the sibling of Perf (born 1450, 45 now).");
  });

  it("names a related party member for a bond, which the page's own picker never offers", () => {
    const text = buildNpcAiContext({ ...form, related_pc_id: "pc1" }, null, [], {
      ...sources, party: [{ id: "pc1", name: "Thorne" }],
    });
    expect(text).toContain("Known associate: Thorne (this NPC is contact of Thorne)");
  });
});
