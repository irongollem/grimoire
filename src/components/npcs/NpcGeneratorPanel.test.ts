import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NpcGeneratorPanel from "./NpcGeneratorPanel.vue";
import NpcGeneratorForm from "./NpcGeneratorForm.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { ASSOCIATE_CHOICES } from "@/lib/npcGenerator/associate";
const mocks = vi.hoisted(() => ({
  createNpc: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
  createKin: vi.fn(),
  createConnection: vi.fn(),
}));

// The NPC and character rows the family prompt reads, and the URL the panel is opened from.
const fixtures = vi.hoisted(() => ({
  npcs: [] as { id: string; name: string; born_year: number | null }[],
  pcs: [] as { id: string; name: string; born_year: number | null }[],
  query: {} as Record<string, string>,
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));
// The free-plan npcs quota — generation spends a credit, so this is checked
// before generating, separately from the AI-on/off toggle above.
const canCreateNpc = ref(true);
// Whether the mocked account can afford the generation — false routes the
// click through requireCredits() into the out-of-credits dialog instead of
// calling generate().
const affordableState = vi.hoisted(() => ({ value: true }));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  useRoute: () => ({ query: fixtures.query }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref(fixtures.pcs) }) }));
vi.mock("@/composables/kinship/useKinLinks", () => ({
  useKinLinks: () => ({ data: ref([]) }),
  useCreateKinLink: () => ({ mutateAsync: mocks.createKin }),
}));
vi.mock("@/stores/ui/npcs", () => ({ useNpcsUiStore: () => ({ npcGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    todayYear: 1495,
    activeCampaign: { text_provider: "openai", image_provider: "openai" },
  }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useCreateNpc: () => ({ mutateAsync: mocks.createNpc, isPending: ref(false) }),
  useNpcs: () => ({ data: ref(fixtures.npcs) }),
}));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: vi.fn() }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => affordableState.value, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", async () => {
  const { ref } = await import("vue");
  return {
    useCampaignProviders: () => ({
      textProvider: ref("openai"),
      textIsByok: ref(false),
      textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base),
      imageProvider: ref("openai"),
      imageIsByok: ref(false),
      imageMultiplier: ref(1), imageCredits: (base: number) => Math.ceil(base),
    }),
  };
});
vi.mock("@/composables/ai/useProviderConfig", () => ({
  PORTRAIT_SIZE_BY_PROVIDER: { openai: "1024x1536", gemini: "1024x1536" },
}));
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: ref([]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: ref([]) }),
  useAddFactionNpc: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnection: () => ({ mutateAsync: mocks.createConnection }) }));
vi.mock("@/ai/useNpcGeneration", () => ({
  useNpcGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    concept: ref(""),
    completedEntityId: ref(null),
    clearCompleted: vi.fn(),
    generate: mocks.generate,
  }),
  toTiptapJson: (text: string) => ({ type: "doc", content: [{ type: "text", text }] }),
}));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateNpc, quota: ref(null) }),
}));

function mountPanel() {
  return mount(NpcGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, PaywallModal: true },
    },
  });
}

describe("NpcGeneratorPanel — AI gating (every plan, credits only)", () => {
  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateNpc.value = true;
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

describe("NpcGeneratorPanel — quota gate (npcs, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
  });

  it("keeps the Generate button visible and enabled-looking at the NPC limit", async () => {
    canCreateNpc.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateNpc.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateNpc.value = true;
    mocks.generate.mockResolvedValue(null);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});

describe("NpcGeneratorPanel — credit gate (short balance, under quota)", () => {
  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateNpc.value = true;
    affordableState.value = true;
    useOutOfCredits().closeOutOfCredits();
  });

  it("keeps the Generate button enabled when the balance is short", async () => {
    affordableState.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the out-of-credits dialog instead of generating when the balance is short", async () => {
    affordableState.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(useOutOfCredits().needed.value).not.toBeNull();
  });
});

describe("NpcGeneratorPanel — family tie from the Add relative link", () => {
  const brenna = "00000000-0000-4000-8000-000000000001";
  const corwin = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.generate.mockReset();
    mocks.createKin.mockReset();
    campaignState.isAiEnabled = true;
    canCreateNpc.value = true;
    affordableState.value = true;
    fixtures.npcs = [
      { id: brenna, name: "Brenna Ashe", born_year: 1459 },
      { id: corwin, name: "Corwin Ashe", born_year: 1456 },
    ];
    fixtures.pcs = [];
    fixtures.query = { kin: "child", of: `npc:${brenna}`, also: `npc:${corwin}` };
  });

  it("states the tie plainly with ages, then writes a parent link from each parent", async () => {
    mocks.generate.mockResolvedValue({
      name: "Wren", race: "Human", alignment: "", age: "20", occupation: "", appearance: "", personality: "",
      backstory: "", notes: "", status: "alive", relationship: "unknown", tags: [],
    });
    mocks.createNpc.mockResolvedValue({ id: "wren" });
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A young scribe.");
    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.createKin).toHaveBeenCalledTimes(2));

    const prompt = mocks.generate.mock.calls[0][0] as string;
    expect(prompt).toContain(
      "The new NPC is the child of Brenna Ashe (born 1459, 36 now) and Corwin Ashe (born 1456, 39 now). The current year is 1495. Give an age that fits.",
    );
    expect(mocks.createKin.mock.calls.map(([row]) => [row.kind, row.from_npc_id, row.to_npc_id])).toEqual([
      ["parent", brenna, "wren"],
      ["parent", corwin, "wren"],
    ]);
  });
});

describe("NpcGeneratorPanel: the known associate becomes a connection", () => {
  const harl = "00000000-0000-4000-8000-0000000000aa";

  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.createConnection.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateNpc.value = true;
    fixtures.npcs = [{ id: harl, name: "Harl", born_year: null }];
    fixtures.pcs = [];
    fixtures.query = {};
    mocks.createNpc.mockResolvedValue({ id: "wren" });
    mocks.createConnection.mockResolvedValue(undefined);
  });

  async function quickCreateWith(key: string, subjectIsFrom = true) {
    const wrapper = mountPanel();
    wrapper.findComponent(NpcGeneratorForm).vm.$emit("update:quickForm", {
      ...wrapper.findComponent(NpcGeneratorForm).props("quickForm"),
      related_npc_id: harl,
      related_npc_tie: ASSOCIATE_CHOICES.find((c) => c.key === key && c.subjectIsFrom === subjectIsFrom),
    });
    await wrapper.findAll("button").find((b) => b.text().includes("Quick Create NPC"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.createConnection).toHaveBeenCalledTimes(1));
    return mocks.createConnection.mock.calls[0][0];
  }

  it("writes a symmetric bond from the new NPC", async () => {
    const input = await quickCreateWith("friend");
    expect(input).toMatchObject({
      subject: { kind: "npc", id: "wren" },
      other: { kind: "npc", id: harl, name: "Harl" },
      choice: { key: "friend", subjectIsFrom: true },
    });
  });

  it("passes a directed tie as it reads from the new NPC", async () => {
    // "Apprentice of": Wren is the apprentice, so the stored mentor tie runs from Harl.
    const input = await quickCreateWith("mentor_of", false);
    expect(input.choice).toMatchObject({ key: "mentor_of", subjectIsFrom: false, word: "apprentice of" });
  });

  it("and the other way round", async () => {
    expect((await quickCreateWith("superior_of")).choice).toMatchObject({ key: "superior_of", subjectIsFrom: true });
  });
});

describe("NpcGeneratorPanel: the NPC it creates", () => {
  const result = {
    name: "Lord Vexan", race: "Human", alignment: "lawful evil", age: "50", occupation: "Chancellor", appearance: "Gaunt.",
    personality: "", backstory: "", notes: "", status: "alive", relationship: "hostile", tags: [],
    disguise_name: "The Stranger", disguise_portrait_url: "https://cdn/d.webp", portrait_url: "https://cdn/p.webp",
    ai_provenance: { generatorType: "npc", provider: "openai", model: "m", generatedAt: "t", edited: false },
  };

  beforeEach(() => {
    mocks.createNpc.mockReset().mockResolvedValue({ id: "new-npc" });
    mocks.generate.mockReset().mockResolvedValue(result);
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateNpc.value = true;
    affordableState.value = true;
    fixtures.query = {};
    fixtures.npcs = [];
    fixtures.pcs = [];
  });

  async function run() {
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A scheming chancellor.");
    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.createNpc).toHaveBeenCalledTimes(1));
    return wrapper;
  }

  it("starts hidden from the players: no audience, no fields shown, true form not revealed, even for a disguised NPC", async () => {
    await run();
    expect(mocks.createNpc.mock.calls[0][0]).toMatchObject({
      is_revealed: false,
      player_visible_to: [],
      player_visible_fields: [],
      disguise_name: "The Stranger",
      campaign_id: "campaign-1",
      ai_provenance: expect.objectContaining({ generatorType: "npc" }),
    });
  });

  it("opens the new NPC's own page when the panel is open", async () => {
    await run();
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/npcs/new-npc"));
  });

  it("keeps the DM's own name, trimmed, over the generated one", async () => {
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A scheming chancellor.");
    await wrapper.get('input[placeholder="Leave blank to auto-generate"]').setValue("  Aldous Pell  ");
    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.createNpc).toHaveBeenCalledTimes(1));
    expect(mocks.createNpc.mock.calls[0][0].name).toBe("Aldous Pell");
  });
});
