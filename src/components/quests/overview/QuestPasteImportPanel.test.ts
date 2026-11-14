import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), start: vi.fn() }));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (_e: unknown, f: string) => f, info: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/billing/useSubscription", () => ({ useSubscription: () => ({ isPro: ref(true) }) }));
vi.mock("@/composables/campaign/useDocumentImport", () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: ref(false) });
  return {
    useActiveDocumentImport: () => ({ data: computed(() => null), isPending: ref(false) }),
    useCreateDocumentImport: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
    useStartExtraction: () => ({ mutateAsync: mocks.start, isPending: ref(false) }),
    useRetryDocumentImport: mutation,
    useAbandonDocumentImport: mutation,
    useImportCost: () => ({ estimate: ref(null), isLoading: ref(false), isError: ref(false) }),
  };
});
vi.mock("@/composables/campaign/useDocumentImportRunner", () => ({ useDocumentImportRunner: () => ({ runImportSweep: vi.fn() }) }));
vi.mock("@/composables/campaign/useImportEntityMatches", () => ({ useImportEntityMatches: () => ({}) }));
vi.mock("@/composables/campaign/useImportSourceOptions", () => ({
  useImportSourceOptions: () => ({ options: ref([]), defaultSourceTitle: ref(""), isLoading: ref(false) }),
}));
vi.mock("@/composables/campaign/useImportQuotaRoom", () => ({
  useImportQuotaRoom: () => ({ roomFor: ref({}), isLoading: ref(false) }),
}));
vi.mock("@/composables/monsters/useMonsterGenerationCost", () => ({ useMonsterGenerationCost: () => ({ credits: ref(null) }) }));
vi.mock("@/lib/tiptap/tiptapToMarkdown", () => ({ tiptapToMarkdown: () => "A page of the DM's own plan." }));
vi.mock("@/components/campaign/DocumentPasteEditor.vue", () => ({
  default: { name: "DocumentPasteEditor", props: ["modelValue"], methods: { reset() {} }, template: "<div />" },
}));
vi.mock("@/components/campaign/ImportKindReview.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/campaign/ImportQuotaWarning.vue", () => ({ default: { template: "<div />" } }));

import QuestPasteImportPanel from "./QuestPasteImportPanel.vue";

async function extract(tickOwn: boolean) {
  const wrapper = mount(QuestPasteImportPanel);
  await flushPromises();
  const boxes = wrapper.findAll("input[type='checkbox']");
  await boxes[0]?.setValue(true);
  if (tickOwn) await boxes[1]?.setValue(true);
  await wrapper.findAll("button").find((b) => b.text().includes("Extract"))?.trigger("click");
  await flushPromises();
}

describe("QuestPasteImportPanel own writing", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "r1" });
    mocks.start.mockReset().mockResolvedValue({});
  });

  it("sends ownWriting true when ticked", async () => {
    await extract(true);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ sourceKind: "text", ownWriting: true }));
  });

  it("sends ownWriting false by default", async () => {
    await extract(false);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ ownWriting: false }));
  });
});
