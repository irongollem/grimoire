import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ItemGeneratorPanel from "./ItemGeneratorPanel.vue";
import { typeChoices } from "@/lib/worldLinks/connections";

const mocks = vi.hoisted(() => ({
  generateAndCreateItem: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
}));
const ui = vi.hoisted(() => ({ itemGeneratorOpen: true }));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui/items", () => ({ useItemsUiStore: () => ui }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ isAiEnabled: true, activeCampaignId: "campaign-1", activeCampaign: {} }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: () => true }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    textProvider: ref("openai"), textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base),
    imageProvider: ref("openai"), imageMultiplier: ref(1), imageCredits: (base: number) => Math.ceil(base),
  }),
}));
vi.mock("@/composables/items/useGenerateItem", () => ({
  useGenerateItem: () => ({ generateAndCreateItem: mocks.generateAndCreateItem }),
}));
vi.mock("@/ai/useItemGeneration", () => ({
  useItemGeneration: () => ({
    isGenerating: ref(false), error: ref(null), completedEntityId: ref(null), concept: ref(""), clearCompleted: vi.fn(),
  }),
}));

function mountPanel() {
  return mount(ItemGeneratorPanel, { global: { stubs: { GeneratorLinksField: true, RouterLink: true } } });
}

async function generate(wrapper: ReturnType<typeof mountPanel>) {
  await wrapper.get("textarea").setValue("A staff of petrified dragon bone.");
  await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
  await vi.waitFor(() => expect(mocks.generateAndCreateItem).toHaveBeenCalled());
}

describe("ItemGeneratorPanel: ties", () => {
  beforeEach(() => {
    mocks.generateAndCreateItem.mockReset().mockResolvedValue({ id: "i1", linkErrors: [] });
    mocks.push.mockReset();
    mocks.toastError.mockReset();
    ui.itemGeneratorOpen = true;
  });

  // Bug caught: a tie chosen under "Tie it to…" lived in the form but the generated item never got it.
  it("passes the ties the field holds to the workflow, and none when nothing was chosen", async () => {
    const wrapper = mountPanel();
    await generate(wrapper);
    expect(mocks.generateAndCreateItem.mock.calls[0]![1]).toMatchObject({ links: [] });

    mocks.generateAndCreateItem.mockClear();
    ui.itemGeneratorOpen = true; // the first run closed the panel
    const carried = typeChoices("item", "npc").find((c) => c.key === "carries")!;
    const link = { kind: "npc", id: "n1", name: "Brenna", choice: carried };
    const tied = mountPanel();
    tied.findComponent({ name: "GeneratorLinksField" }).vm.$emit("update:modelValue", [link]);
    await generate(tied);
    expect(mocks.generateAndCreateItem.mock.calls[0]![1]).toMatchObject({ links: [link] });
  });

  it("says a tie failed and still opens the saved item", async () => {
    mocks.generateAndCreateItem.mockResolvedValue({ id: "i1", linkErrors: ["Brenna: denied"] });
    await generate(mountPanel());
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/vault/i1"));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("Brenna: denied"));
  });
});
