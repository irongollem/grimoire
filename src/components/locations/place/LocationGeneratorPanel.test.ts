import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationGeneratorPanel from "./LocationGeneratorPanel.vue";
import { typeChoices } from "@/lib/worldLinks/connections";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";

const mocks = vi.hoisted(() => ({
  createLocation: vi.fn(),
  createConnection: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));
// The free-plan locations quota — generation spends a credit, so this is
// checked before generating, separately from the AI-on/off toggle above.
const canCreateLocation = ref(true);

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui/generators", () => ({ useGeneratorUiStore: () => ({ locationGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
    decryptedOpenAiKey: null,
  }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useCreateLocation: () => ({ mutateAsync: mocks.createLocation }),
  useLocationTree: () => ({ locationOptions: ref([]) }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([{ id: "npc-brenna", name: "Brenna" }]) }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnectionInCampaign: () => ({ mutateAsync: mocks.createConnection }) }));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: vi.fn() }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)), info: vi.fn(), success: vi.fn() }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
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
vi.mock("@/ai/useLocationGeneration", () => ({
  useLocationGeneration: () => ({
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
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateLocation, quota: ref(null) }),
}));

function mountPanel() {
  return mount(LocationGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, GeneratorLinksField: true, PaywallModal: true },
    },
  });
}

describe("LocationGeneratorPanel — AI gating (every plan, credits only)", () => {
  beforeEach(() => {
    mocks.createLocation.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateLocation.value = true;
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

describe("LocationGeneratorPanel — quota gate (locations, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createLocation.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
  });

  it("keeps the Generate button visible and enabled-looking at the location limit", async () => {
    canCreateLocation.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A crumbling dwarven forge district.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateLocation.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A crumbling dwarven forge district.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateLocation.value = true;
    mocks.generate.mockResolvedValue(null);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A crumbling dwarven forge district.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});

describe("LocationGeneratorPanel — generate, create, land on the new place", () => {
  const result = {
    name: "Forgeholm",
    description: "Anvils ring day and night.",
    player_summary: "",
    tags: ["dwarven"],
    notes: "",
    image_url: null,
    map_url: null,
    ai_provenance: null,
  };

  beforeEach(() => {
    mocks.createLocation.mockReset().mockResolvedValue({ id: "new-place" });
    mocks.createConnection.mockReset().mockResolvedValue(undefined);
    mocks.toastError.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateLocation.value = true;
  });

  async function run(concept = "  A crumbling dwarven forge district.  ") {
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue(concept);
    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    await Promise.resolve();
    return wrapper;
  }

  it("asks for the trimmed concept, creates the place as 'other' with no parent, and goes to it", async () => {
    mocks.generate.mockResolvedValue(result);
    await run();
    expect(mocks.generate.mock.calls[0]![0]).toBe("A crumbling dwarven forge district.");
    await vi.waitFor(() => expect(mocks.createLocation).toHaveBeenCalled());
    expect(mocks.createLocation).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Forgeholm", location_type: "other", parent_id: null, player_summary: null, notes: null, tags: ["dwarven"] }),
    );
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/locations?at=new-place"));
  });

  it("creates nothing when the generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    await run();
    await Promise.resolve();
    expect(mocks.createLocation).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    // The generation reports its own failure; saving must not pile a second one on top.
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("stays on the page when the generated place cannot be saved", async () => {
    mocks.generate.mockResolvedValue(result);
    mocks.createLocation.mockRejectedValue(new Error("db down"));
    await run();
    await vi.waitFor(() => expect(mocks.createLocation).toHaveBeenCalled());
    await Promise.resolve();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("db down");
  });

  // Bug caught: the workflow took a keeper but the page had no way to pick one, so a made place was never kept by anyone.
  it("makes the NPC picked as keeper the place's keeper, and no one when none is picked", async () => {
    mocks.generate.mockResolvedValue(result);
    await run();
    await vi.waitFor(() => expect(mocks.createLocation).toHaveBeenCalled());
    expect(mocks.createLocation.mock.calls[0]![0]).toMatchObject({ npc_owner_id: null });

    mocks.createLocation.mockClear();
    const picker = mountPanel();
    const keeper = picker.findAllComponents({ name: "EntityCombobox" }).find((c) => c.props("options").some((o: { id: string }) => o.id === "npc-brenna"))!;
    keeper.vm.$emit("update:modelValue", "npc-brenna");
    await picker.get("textarea").setValue("An inn.");
    await picker.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.createLocation).toHaveBeenCalled());
    expect(mocks.createLocation.mock.calls[0]![0]).toMatchObject({ npc_owner_id: "npc-brenna" });
  });

  // Bug caught: a tie chosen under "Tie it to…" lived in the form but the generated place never got it.
  it("ties the new place to what the Ties field holds, and says so when a tie fails", async () => {
    mocks.generate.mockResolvedValue(result);
    const controls = typeChoices("location", "faction").find((c) => c.key === "controls")!;
    const wrapper = mountPanel();
    wrapper.findComponent({ name: "GeneratorLinksField" }).vm.$emit("update:modelValue", [{ kind: "faction", id: "f1", name: "The Red Hand", choice: controls }]);
    await wrapper.get("textarea").setValue("A fort.");
    mocks.createConnection.mockRejectedValueOnce(new Error("denied"));
    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.createConnection).toHaveBeenCalledTimes(1));
    expect(mocks.createConnection.mock.calls[0]![0]).toMatchObject({
      input: { subject: { kind: "location", id: "new-place" }, other: { kind: "faction", id: "f1" }, choice: { key: "controls" } },
      campaignId: "campaign-1",
    });
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("The Red Hand")));
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/locations?at=new-place"));
  });
});
