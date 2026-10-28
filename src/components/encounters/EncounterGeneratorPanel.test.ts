import { mount, RouterLinkStub } from "@vue/test-utils";
import { sourceLabel } from "@/lib/library/sourceLabel";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EncounterGeneratorPanel from "./EncounterGeneratorPanel.vue";
import type { EncounterAiResult } from "@/ai/types";

const mocks = vi.hoisted(() => ({
  createEncounter: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
}));

const isAiEnabled = ref(true);
const generated = ref<EncounterAiResult | null>(null);
const bestiaryLoading = ref(false);
const partyRows = ref<{ id: string }[]>([]);
// The free-plan encounters quota — generation spends a credit, so this must
// be checked before generating, not just at create. EncounterGeneratorPanel
// was the one generator panel missing this pre-check (only a post-create
// catch existed) before the useGenerationGate extraction.
const canCreateEncounter = ref(true);

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, new Map()),
  }),
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui/generators", () => ({ useGeneratorUiStore: () => ({ encounterGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
    activeCampaign: { text_provider: "openai" },
  }),
}));
vi.mock("@/composables/encounters/useEncounters", () => ({
  useCreateEncounter: () => ({ mutateAsync: mocks.createEncounter }),
}));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({ useMonsterIndex: () => ({ data: ref([]), isLoading: bestiaryLoading }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: partyRows }) }));
// The surface reads the active party; here it is the same fixture as useParty.
vi.mock("@/composables/party/useActiveParty", async () => ({
  useActiveParty: (await import("@/composables/party/useParty")).useParty,
}));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base), textIsByok: ref(false) }),
}));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateEncounter, quota: ref(null) }),
}));
const requireCredits = vi.fn(() => true);
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits }) }));
vi.mock("@/ai/useEncounterGeneration", () => ({
  useEncounterGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    concept: ref(""),
    completedEntityId: ref(null),
    clearCompleted: vi.fn(),
    result: generated,
    generate: mocks.generate,
    clearResult: vi.fn(),
  }),
}));

function mountPanel() {
  return mount(EncounterGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, PaywallModal: true },
    },
  });
}

describe("EncounterGeneratorPanel — quota gate (encounters, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createEncounter.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    isAiEnabled.value = true;
    canCreateEncounter.value = true;
    requireCredits.mockReset().mockReturnValue(true);
  });

  it("keeps the Generate button visible and enabled-looking at the encounter limit", async () => {
    canCreateEncounter.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("Goblin ambush on the forest road.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateEncounter.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("Goblin ambush on the forest road.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(requireCredits).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateEncounter.value = true;
    mocks.generate.mockResolvedValue(undefined);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("Goblin ambush on the forest road.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});

describe("EncounterGeneratorPanel — credit gate (short balance, under quota)", () => {
  beforeEach(() => {
    mocks.createEncounter.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    isAiEnabled.value = true;
    canCreateEncounter.value = true;
    requireCredits.mockReset();
  });

  it("opens the out-of-credits dialog instead of generating when the balance is short", async () => {
    requireCredits.mockReturnValue(false);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("Goblin ambush on the forest road.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(requireCredits).toHaveBeenCalledTimes(1);
  });
});

describe("EncounterGeneratorPanel: generating and creating", () => {
  beforeEach(() => {
    mocks.createEncounter.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    isAiEnabled.value = true;
    canCreateEncounter.value = true;
    requireCredits.mockReset().mockReturnValue(true);
    generated.value = {
      name: "Road Ambush",
      difficulty: "hard",
      environment: "A forest road",
      tactics: "Hit the cart first",
      twist: "",
      combatants: [{ name: "Unknown Horror", count: 2, role: "Ambusher" }],
    };
    partyRows.value = [{ id: "pc-1" }, { id: "pc-2" }];
    bestiaryLoading.value = false;
  });

  const clickButton = async (wrapper: ReturnType<typeof mountPanel>, label: string) =>
    wrapper.findAll("button").find((b) => b.text().includes(label))!.trigger("click");

  it("sends the concept trimmed, with the difficulty the DM picked", async () => {
    generated.value = null;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("   Goblin ambush   ");
    await clickButton(wrapper, "Hard");
    await clickButton(wrapper, "Generate with AI");
    expect(mocks.generate).toHaveBeenCalledWith("Goblin ambush", { difficulty: "hard" });
  });

  it("creates the encounter with the whole party and keeps a name the bestiary missed in the description", async () => {
    mocks.createEncounter.mockResolvedValue({ id: "enc-9" });
    const wrapper = mountPanel();
    await clickButton(wrapper, "Create Encounter");
    const [input] = mocks.createEncounter.mock.calls[0];
    expect(input.name).toBe("Road Ambush");
    expect(input.party_member_ids).toEqual(["pc-1", "pc-2"]);
    expect(input.combatants).toEqual([]);
    expect(input.description).toContain("Add manually: Unknown Horror (Ambusher)");
    expect(input.description).toContain("Tactics: Hit the cart first");
    expect(input.description).not.toContain("Twist:");
  });

  it("opens the new encounter in the editor, and shows the failure when creating fails", async () => {
    mocks.createEncounter.mockResolvedValueOnce({ id: "enc-9" });
    const wrapper = mountPanel();
    await clickButton(wrapper, "Create Encounter");
    await clickButton(wrapper, "Open Encounter");
    expect(mocks.push).toHaveBeenCalledWith("/encounters/enc-9?edit=true");

    mocks.createEncounter.mockRejectedValueOnce(new Error("The database is asleep"));
    const failing = mountPanel();
    await clickButton(failing, "Create Encounter");
    await Promise.resolve();
    expect(failing.text()).toContain("The database is asleep");
    expect(failing.text()).not.toContain("Open Encounter");
  });

  it("will not build an encounter while the bestiary is still loading (every name would read as missing)", async () => {
    bestiaryLoading.value = true;
    const wrapper = mountPanel();
    const create = wrapper.findAll("button").find((b) => b.text().includes("Create Encounter"))!;
    expect(create.attributes("disabled")).toBeDefined();
    await create.trigger("click");
    expect(mocks.createEncounter).not.toHaveBeenCalled();
  });

  it("answers a quota race at create with the paywall, not an error string", async () => {
    mocks.createEncounter.mockRejectedValueOnce(new Error("quota_exceeded"));
    const wrapper = mountPanel();
    await clickButton(wrapper, "Create Encounter");
    await Promise.resolve();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(wrapper.text()).not.toContain("quota_exceeded");
  });
});
