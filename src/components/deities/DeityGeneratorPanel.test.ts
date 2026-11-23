import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeityGeneratorPanel from "./DeityGeneratorPanel.vue";
import { typeChoices } from "@/lib/worldLinks/connections";

const mocks = vi.hoisted(() => ({
  generateDeityDraft: vi.fn(),
  saveDeity: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
  ui: { deityGeneratorOpen: true },
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui/generators", () => ({ useGeneratorUiStore: () => mocks.ui }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ isAiEnabled: true, activeCampaignId: "campaign-1", activeCampaign: { text_provider: "openai" } }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => (e instanceof Error ? e.message : "boom") }),
}));
vi.mock("@/composables/deities/useDeities", () => ({
  useAllPantheons: () => ({ data: ref([]) }),
  useAllDeities: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/deities/useGenerateDeity", () => ({
  useGenerateDeity: () => ({
    generation: { isGenerating: ref(false), error: ref(null), completedEntityId: ref(null), concept: ref("") },
    generateDeityDraft: mocks.generateDeityDraft,
    saveDeity: mocks.saveDeity,
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base), textIsByok: ref(false),
    imageIsByok: ref(false), imageProvider: ref("openai"), imageCredits: (base: number) => Math.ceil(base),
  }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true), quota: ref(null) }) }));

function mountPanel() {
  return mount(DeityGeneratorPanel, {
    global: { stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, PaywallModal: true } },
  });
}

describe("DeityGeneratorPanel: ties", () => {
  const draft = { result: { name: "Vesper" }, pantheonId: null, alignment: null, links: [] };
  const protects = typeChoices("deity", "location")[0]!;
  const link = { kind: "location", id: "l1", name: "The Temple", choice: protects };

  async function generateWithLink() {
    const w = mountPanel();
    await w.get("textarea").setValue("A goddess of crossroads");
    w.findComponent({ name: "GeneratorLinksField" }).vm.$emit("update:modelValue", [link]);
    await w.vm.$nextTick();
    await w.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await flushPromises();
  }

  beforeEach(() => {
    mocks.generateDeityDraft.mockReset().mockResolvedValue(draft);
    mocks.saveDeity.mockReset().mockResolvedValue({ id: "d1", name: "Vesper", campaignId: "campaign-1", notesFailure: null, linkErrors: [] });
    mocks.push.mockReset();
    mocks.toastError.mockReset();
    mocks.ui.deityGeneratorOpen = true;
  });

  // Bug caught: ties chosen under "Tie it to…" lived in the panel but the deity was generated and saved without them.
  it("hands the chosen ties to the generation, and opens the saved deity", async () => {
    await generateWithLink();
    expect(mocks.generateDeityDraft).toHaveBeenCalledWith("A goddess of crossroads", expect.objectContaining({ links: [link] }));
    expect(mocks.push).toHaveBeenCalledWith("/deities/d1");
  });

  // Bug caught: a tie that failed to write was swallowed, so the DM thought the deity was tied.
  it("says which ties could not be written and still opens the deity", async () => {
    mocks.saveDeity.mockResolvedValue({ id: "d1", name: "Vesper", campaignId: "campaign-1", notesFailure: null, linkErrors: ["The Temple: denied"] });
    await generateWithLink();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("The Temple: denied"));
    expect(mocks.push).toHaveBeenCalledWith("/deities/d1");
  });

  it("sends no ties when none were chosen", async () => {
    const w = mountPanel();
    await w.get("textarea").setValue("A goddess");
    await w.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await flushPromises();
    expect(mocks.generateDeityDraft.mock.calls[0][1].links).toEqual([]);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
