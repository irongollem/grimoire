import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FactionGeneratorPanel from "./FactionGeneratorPanel.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";

const mocks = vi.hoisted(() => ({
  createFaction: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
  addFactionNpc: vi.fn(),
  createConnection: vi.fn(),
  ui: { factionGeneratorOpen: true },
  npcs: [] as { id: string; name: string; occupation: string | null }[],
  places: [] as { id: string; name: string; depth: number }[],
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));
// The free-plan factions quota — generation spends a credit, so this is
// checked before generating, separately from the AI-on/off toggle above.
const canCreateFaction = ref(true);

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui/generators", () => ({ useGeneratorUiStore: () => mocks.ui }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
  }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useCreateFaction: () => ({ mutateAsync: mocks.createFaction }),
  useAddFactionNpc: () => ({ mutateAsync: mocks.addFactionNpc }),
}));
vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: mocks.createConnection }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref(mocks.npcs) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: ref(mocks.places) }) }));
vi.mock("@/ai/useFactionGeneration", () => ({
  useFactionGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    completedEntityId: ref(null),
    concept: ref(""),
    clearCompleted: vi.fn(),
    generate: mocks.generate,
  }),
}));
vi.mock("@/ai/useNpcGeneration", () => ({
  toTiptapJson: (text: string) => ({ type: "doc", content: [{ type: "text", text }] }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base), textIsByok: ref(false) }),
}));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateFaction, quota: ref(null) }),
}));

function mountPanel() {
  return mount(FactionGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, PaywallModal: true },
    },
  });
}

describe("FactionGeneratorPanel — AI gating (every plan, credits only)", () => {
  beforeEach(() => {
    mocks.createFaction.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateFaction.value = true;
  });

  it("shows a real Generate button (no paywall) when AI is on, regardless of plan", () => {
    const wrapper = mountPanel();

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(false);
  });

  it("shows AiOffNotice instead of a Generate button when the campaign's AI toggle is off", () => {
    campaignState.isAiEnabled = false;
    const wrapper = mountPanel();

    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(true);
    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeFalsy();
  });
});

describe("FactionGeneratorPanel — quota gate (factions, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createFaction.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
  });

  it("keeps the Generate button visible and enabled-looking at the faction limit", async () => {
    canCreateFaction.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A shadowy thieves' guild.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });


  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateFaction.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A shadowy thieves' guild.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateFaction.value = true;
    mocks.generate.mockResolvedValue(null);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A shadowy thieves' guild.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});

describe("FactionGeneratorPanel — generate and create", () => {
  const generated = { name: "The Ravens", faction_type: "", alignment: "", description: "Spies.", image_url: "emblem.png", tags: ["spies"] };
  beforeEach(() => {
    mocks.createFaction.mockReset().mockResolvedValue({ id: "f1" });
    mocks.generate.mockReset().mockResolvedValue(generated);
    mocks.addFactionNpc.mockReset();
    mocks.createConnection.mockReset();
    mocks.push.mockReset();
    mocks.ui.factionGeneratorOpen = true;
    campaignState.isAiEnabled = true;
    canCreateFaction.value = true;
    mocks.npcs = [{ id: "n1", name: "Mara", occupation: "Smith" }, { id: "n2", name: "Odo", occupation: null }];
    mocks.places = [{ id: "loc-1", name: "Thornkeep", depth: 0 }];
  });
  const generate = async (w: ReturnType<typeof mountPanel>) => {
    await w.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await flushPromises();
  };
  const pick = (w: ReturnType<typeof mountPanel>, placeholder: string, id: string) =>
    w.findAllComponents({ name: "EntityCombobox" }).find((c) => c.attributes("placeholder") === placeholder)!.vm.$emit("update:modelValue", id);

  it("generates from the trimmed concept, creates the faction, links leader and seat, and opens it", async () => {
    const w = mountPanel();
    await w.get("textarea").setValue("  A guild of spies  ");
    pick(w, "Search NPCs…", "n1");
    pick(w, "Search locations…", "loc-1");
    await w.vm.$nextTick();
    await generate(w);
    expect(mocks.generate).toHaveBeenCalledWith(
      "A guild of spies",
      expect.objectContaining({ leader_name: "Mara (Smith)", headquarters_name: "Thornkeep", faction_type: undefined }),
    );
    // The generated blank type and alignment are stored as null, not as "".
    expect(mocks.createFaction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "The Ravens", faction_type: null, alignment: null, emblem_url: "emblem.png", player_visible_to: [] }),
    );
    expect(mocks.addFactionNpc).toHaveBeenCalledWith({ faction_id: "f1", npc_id: "n1", role: "Leader" });
    expect(mocks.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ subject: { kind: "faction", id: "f1" }, other: expect.objectContaining({ kind: "location", id: "loc-1" }) }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/factions/f1");
    expect(mocks.ui.factionGeneratorOpen).toBe(false);
  });

  it("without a leader or headquarters it creates only the faction, and names an occupation-less leader plainly", async () => {
    const w = mountPanel();
    await w.get("textarea").setValue("A guild");
    await generate(w);
    expect(mocks.addFactionNpc).not.toHaveBeenCalled();
    expect(mocks.createConnection).not.toHaveBeenCalled();
    expect(mocks.generate.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ leader_name: undefined, headquarters_name: undefined }));

    mocks.generate.mockClear();
    pick(w, "Search NPCs…", "n2");
    await w.vm.$nextTick();
    await generate(w);
    expect(mocks.generate.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ leader_name: "Odo" }));
  });

  it("creates nothing and stays open when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    const w = mountPanel();
    await w.get("textarea").setValue("A guild");
    await generate(w);
    expect(mocks.createFaction).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.ui.factionGeneratorOpen).toBe(true);
  });

  it("a create refused for quota opens the paywall and links nothing", async () => {
    mocks.createFaction.mockRejectedValue({ message: "quota_exceeded" });
    const w = mountPanel();
    await w.get("textarea").setValue("A guild");
    pick(w, "Search NPCs…", "n1");
    await w.vm.$nextTick();
    await generate(w);
    expect(w.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(mocks.addFactionNpc).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
