import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NpcGeneratorPanel from "./NpcGeneratorPanel.vue";
import NpcGeneratorForm from "./NpcGeneratorForm.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { ASSOCIATE_CHOICES } from "@/lib/npcGenerator/associate";
import { typeChoices } from "@/lib/worldLinks/connections";
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
  locations: [] as { id: string; name: string; player_summary: string }[],
  query: {} as Record<string, string>,
  /** The campaign's kin links, as rows. */
  kinLinks: [] as { id: string; kind: string; from_npc_id: string | null; from_party_member_id: string | null; to_npc_id: string | null; to_party_member_id: string | null }[],
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true, activeCampaignId: "campaign-1" }));
// The free-plan npcs quota — generation spends a credit, so this is checked
// before generating, separately from the AI-on/off toggle above.
const canCreateNpc = ref(true);
// Whether the mocked account can afford the generation — false routes the
// click through requireCredits() into the out-of-credits dialog instead of
// calling generate().
const affordableState = vi.hoisted(() => ({ value: true }));
// The world's peoples and the roll's outcome, mutable per test (#1255 item 30).
type TestPeople = { id: string; kind: "species" | "creature"; recordId: string; fromLibrary: boolean; name: string; readable: boolean; percent: number };
const worldState = vi.hoisted(() => ({ peoples: [] as TestPeople[], roll: vi.fn<() => TestPeople | null>() }));
const starterPackState = vi.hoisted(() => ({ fail: false, switchCampaign: false }));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  useRoute: () => ({ query: fixtures.query }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref(fixtures.pcs) }) }));
vi.mock("@/composables/kinship/useKinLinks", () => ({
  useKinLinks: () => ({ data: ref(fixtures.kinLinks) }),
  useCreateKinLink: () => ({ mutateAsync: mocks.createKin }),
  useCreateKinLinkInCampaign: () => ({ mutateAsync: mocks.createKin }),
}));
vi.mock("@/composables/rules/useSpecies", () => ({ useCampaignSpecies: () => ({ data: ref([{ name: "Tabaxi" }]) }) }));
vi.mock("@/composables/canon/useCampaignPeoples", async () => {
  const { computed } = await import("vue");
  return { useCampaignPeoples: () => ({ peoples: computed(() => worldState.peoples), isLoading: ref(false) }) };
});
vi.mock("@/lib/canon/peoples", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/canon/peoples")>(),
  rollPeople: () => worldState.roll(),
}));
vi.mock("@/stores/ui/npcs", () => ({ useNpcsUiStore: () => ({ npcGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    get activeCampaignId() { return campaignState.activeCampaignId; },
    activeGameSystem: "dnd5e-2014",
    todayYear: 1495,
    get activeCampaign() { return { text_provider: "openai", image_provider: "openai" }; },
  }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useCreateNpc: () => ({ mutateAsync: mocks.createNpc, isPending: ref(false) }),
  useCreateNpcInCampaign: () => ({ mutateAsync: mocks.createNpc, isPending: ref(false) }),
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
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: ref(fixtures.locations) }) }));
vi.mock("@/composables/items/useItemIndex", () => ({ useItemIndex: () => ({ data: ref([]) }) }));
vi.mock("@/composables/npcs/useNpcStarterPacks", () => ({
  useNpcStarterPacks: () => ({
    data: ref(undefined),
    refetch: async () => {
      if (starterPackState.switchCampaign) campaignState.activeCampaignId = "campaign-2";
      return starterPackState.fail
        ? { isError: true, data: undefined, error: new Error("offline") }
        : { isError: false, data: [{ id: "everyday", label: "Everyday carry", cues: [], items: ["Coin purse"] }] };
    },
  }),
}));
vi.mock("@/composables/items/useNpcInventory", () => ({
  useAddNpcInventoryItem: () => ({ mutateAsync: vi.fn() }),
  useAddNpcInventoryItemInCampaign: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: ref([]) }),
  useAddFactionNpc: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: mocks.createConnection }),
  useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.createConnection }),
}));
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
    campaignState.activeCampaignId = "campaign-1";
    starterPackState.fail = false;
    starterPackState.switchCampaign = false;
    canCreateNpc.value = true;
  });

  it("shows a real Generate button (no paywall) when AI is on, regardless of plan", () => {
    const wrapper = mountPanel();

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(false);
  });

  it("does not start paid generation when the configured starter packs cannot be loaded", async () => {
    starterPackState.fail = true;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A traveling herbalist.");
    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await flushPromises();
    expect(mocks.generate).not.toHaveBeenCalled();
    starterPackState.fail = false;
  });

  it("does not send generation into another campaign if it switches during pack loading", async () => {
    starterPackState.switchCampaign = true;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A traveling herbalist.");
    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await flushPromises();
    expect(mocks.generate).not.toHaveBeenCalled();
    starterPackState.switchCampaign = false;
    campaignState.activeCampaignId = "campaign-1";
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

  it("sends a short concept separately from a location summary that would put it over the limit", async () => {
    canCreateNpc.value = true;
    mocks.generate.mockResolvedValue(null);
    const summary = "Targos lives off the lake. ".repeat(39).trim();
    fixtures.locations = [{ id: "targos", name: "Targos", player_summary: summary }];
    const wrapper = mountPanel();
    const concept = "A trader who once regularly visited Taj's home community and became stranded in Icewind Dale. She remembers the place and some of its people, giving him a personal connection to his past.";
    try {
      await wrapper.get("textarea").setValue(concept);
      const form = wrapper.getComponent(NpcGeneratorForm);
      form.vm.$emit("update:quickForm", { ...form.props("quickForm"), location_id: "targos", name: "Sera Vael", race: "Halfling" });
      const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
      await generateButton.trigger("click");
      expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(concept, expect.objectContaining({
        context: expect.stringContaining(`Location summary: ${summary}`),
      }));
      expect(mocks.generate.mock.calls[0][1].context).toContain("Name: Sera Vael\nRace: Halfling");
    } finally {
      wrapper.unmount();
      fixtures.locations = [];
    }
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

    const { context } = mocks.generate.mock.calls[0][1];
    expect(context).toContain(
      "The new NPC is the child of Brenna Ashe (born 1459, 36 now) and Corwin Ashe (born 1456, 39 now). The current year is 1495. Give an age that fits.",
    );
    expect(mocks.createKin.mock.calls.map(([row]) => [row.input.kind, row.input.from_npc_id, row.input.to_npc_id])).toEqual([
      ["parent", brenna, "wren"],
      ["parent", corwin, "wren"],
    ]);
  });
});

describe("NpcGeneratorPanel: the rest of the family is offered, never assumed", () => {
  const tam = "00000000-0000-4000-8000-0000000000b1";
  const nella = "00000000-0000-4000-8000-0000000000b2";
  const odo = "00000000-0000-4000-8000-0000000000b3";

  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.createKin.mockReset();
    campaignState.isAiEnabled = true;
    canCreateNpc.value = true;
    fixtures.npcs = [{ id: tam, name: "Tam", born_year: 1480 }, { id: nella, name: "Nella", born_year: 1478 }, { id: odo, name: "Odo", born_year: 1450 }];
    fixtures.pcs = [];
    // Odo is the parent of Tam and of Nella; the new NPC is made a parent of Tam.
    fixtures.kinLinks = [
      { id: "k1", kind: "parent", from_npc_id: odo, from_party_member_id: null, to_npc_id: tam, to_party_member_id: null },
      { id: "k2", kind: "parent", from_npc_id: odo, from_party_member_id: null, to_npc_id: nella, to_party_member_id: null },
    ];
    fixtures.query = { kin: "parent", of: `npc:${tam}` };
    mocks.createNpc.mockResolvedValue({ id: "mara" });
  });
  afterEach(() => {
    fixtures.kinLinks = [];
    fixtures.query = {};
  });

  async function quickCreate(wrapper: ReturnType<typeof mountPanel>) {
    await wrapper.findAll("button").find((b) => b.text().includes("Quick Create NPC"))!.trigger("click");
    await flushPromises();
    return mocks.createKin.mock.calls.map(([row]) => [row.input.kind, row.input.from_npc_id, row.input.to_npc_id]);
  }

  // Bug caught: a new parent silently made the parent of every sibling, half-siblings included.
  it("offers the relative's sibling unticked, and writes only the named tie until it is ticked", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    const offer = wrapper.get('[data-testid="npc-kin-offers"]');
    expect(offer.text()).toContain("Parent of Nella");
    expect((offer.get("input").element as HTMLInputElement).checked).toBe(false);
    expect(await quickCreate(wrapper)).toEqual([["parent", "mara", tam]]);
  });

  it("writes the sibling too once the DM ticks them", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('[data-testid="npc-kin-offers"] input').setValue(true);
    expect(await quickCreate(wrapper)).toEqual([["parent", "mara", tam], ["parent", "mara", nella]]);
  });

  // Bug caught: a tick left behind when the DM changes the tie, written behind their back.
  it("drops a tick that is no longer offered", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('[data-testid="npc-kin-offers"] input').setValue(true);
    const form = wrapper.findComponent(NpcGeneratorForm);
    form.vm.$emit("update:quickForm", { ...form.props("quickForm"), related_npc_kin: "child" });
    await flushPromises();
    expect(form.props("quickForm").also_kin).toEqual([]);
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
    return mocks.createConnection.mock.calls[0][0].input;
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

  // Bug caught: a tie chosen under "Tie it to…" lived in the form but Quick Create never wrote it.
  it("writes a tie chosen in the Ties field, to the new NPC", async () => {
    const wrapper = mountPanel();
    const form = wrapper.findComponent(NpcGeneratorForm);
    const worships = typeChoices("npc", "deity").find((c) => c.key === "worships")!;
    form.vm.$emit("update:quickForm", { ...form.props("quickForm"), links: [{ kind: "deity", id: "d1", name: "Auril", choice: worships }] });
    await wrapper.findAll("button").find((b) => b.text().includes("Quick Create NPC"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.createConnection).toHaveBeenCalledTimes(1));
    expect(mocks.createConnection.mock.calls[0][0].input).toMatchObject({
      subject: { kind: "npc", id: "wren" },
      other: { kind: "deity", id: "d1", name: "Auril" },
      choice: { key: "worships", subjectIsFrom: true },
    });
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

  const elf: TestPeople = { id: "p1", kind: "species", recordId: "srd_elf", fromLibrary: true, name: "Elf", readable: true, percent: 80 };
  const human: TestPeople = { id: "p2", kind: "species", recordId: "srd_human", fromLibrary: true, name: "Human", readable: true, percent: 15 };
  const owlbear: TestPeople = { id: "p3", kind: "creature", recordId: "srd_owlbear", fromLibrary: true, name: "Owlbear", readable: true, percent: 5 };

  describe("species from the world's peoples", () => {
    beforeEach(() => {
      worldState.peoples = [elf, human];
      worldState.roll.mockReset();
    });
    afterEach(() => { worldState.peoples = []; });

    // Bug caught: a blank species stayed the model's choice (a human), so an 80% elven world generated humans.
    it("rolls the species once and uses it in the prompt and on the saved NPC", async () => {
      worldState.roll.mockReturnValue(elf);
      await run();
      expect(worldState.roll).toHaveBeenCalledTimes(1);
      expect(mocks.generate.mock.calls[0][1].context).toContain("Race: Elf");
      expect(mocks.createNpc.mock.calls[0][0].race).toBe("Elf");
    });

    // Bug caught: the roll overrode a species the DM picked by hand.
    it("rolls nothing when the DM picked a species", async () => {
      const wrapper = mountPanel();
      await wrapper.get("textarea").setValue("A scheming chancellor.");
      const form = wrapper.getComponent(NpcGeneratorForm);
      form.vm.$emit("update:quickForm", { ...form.props("quickForm"), race: "Tabaxi" });
      await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
      await vi.waitFor(() => expect(mocks.createNpc).toHaveBeenCalledTimes(1));
      expect(worldState.roll).not.toHaveBeenCalled();
      expect(mocks.generate.mock.calls[0][1].context).toContain("Race: Tabaxi");
      expect(mocks.createNpc.mock.calls[0][0].race).toBe("Tabaxi");
    });

    // Bug caught: the 5% left for anyone else silently became a human, or named a listed people.
    it("asks for a people the list does not hold when the roll lands on anyone else", async () => {
      worldState.roll.mockReturnValue(null);
      await run();
      expect(mocks.generate.mock.calls[0][1].context).toContain("Race: not one of Elf, Human; a people this world rarely sees");
      expect(mocks.createNpc.mock.calls[0][0].race).toBe("Human");
    });

    // Bug caught: a rolled creature was passed on as a bare Race line, so the model wrote a monster to fight and the
    // saved NPC's race was not the creature's name.
    it("tells the model a rolled creature is one of the world's peoples and saves its name as the race", async () => {
      worldState.peoples = [elf, owlbear];
      worldState.roll.mockReturnValue(owlbear);
      await run();
      const context = mocks.generate.mock.calls[0][1].context as string;
      expect(context).toContain("Race: Owlbear");
      expect(context).toContain("This person is a Owlbear, one of the world's peoples, not a monster to fight.");
      expect(mocks.createNpc.mock.calls[0][0].race).toBe("Owlbear");
    });

    // Bug caught: the species select ignored the world's peoples (or listed a species twice), so the DM could not pick
    // the people the world is made of from the top of the list.
    it("lists the peoples in order, then the campaign's other species, and names the blank option for the roll", () => {
      worldState.peoples = [elf, owlbear];
      const wrapper = mountPanel();
      const select = wrapper.findAll("select").find((el) => el.findAll("option").some((o) => o.text() === "Tabaxi"));
      expect(select?.findAll("option").map((o) => o.text())).toEqual(["Roll from the world's peoples", "Elf", "Owlbear", "Tabaxi"]);
    });

    // Bug caught: a species that is both a people and one of the campaign's species showed twice in the select.
    it("lists a species once when it is both a people and one of the campaign's species", () => {
      worldState.peoples = [{ ...elf, name: "Tabaxi" }];
      const wrapper = mountPanel();
      const select = wrapper.findAll("select").find((el) => el.findAll("option").some((o) => o.text() === "Tabaxi"));
      expect(select?.findAll("option").map((o) => o.text())).toEqual(["Roll from the world's peoples", "Tabaxi"]);
    });

    // Bug caught: the not-a-monster line was added for every roll, telling the model a rolled elf is not a monster.
    it("adds no not-a-monster line for a rolled species", async () => {
      worldState.roll.mockReturnValue(elf);
      await run();
      expect(mocks.generate.mock.calls[0][1].context).not.toContain("not a monster to fight");
    });

    // Bug caught: a campaign that never listed peoples gained a Race line (or a roll) it never asked for.
    it("adds no species line and rolls nothing when no peoples are set", async () => {
      worldState.peoples = [];
      await run();
      expect(worldState.roll).not.toHaveBeenCalled();
      expect(mocks.generate.mock.calls[0][1].context).not.toContain("Race:");
    });
  });
});
