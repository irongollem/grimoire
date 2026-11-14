import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (_e: unknown, f: string) => f, info: vi.fn() }) }));
vi.mock("@/composables/billing/useSubscription", () => ({ useSubscription: () => ({ isPro: ref(true) }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: () => true }) }));
vi.mock("@/lib/documentImport/pageCount", () => ({
  countPages: async () => ({ ok: true, kind: "pdf", pageCount: 2 }),
}));
vi.mock("@/composables/campaign/useDocumentImport", () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: ref(false) });
  return {
    useActiveDocumentImport: () => ({ data: computed(() => null), isPending: ref(false) }),
    useCreateDocumentImport: () => ({ mutateAsync: mocks.mutateAsync, isPending: ref(false) }),
    useStartExtraction: mutation,
    useRetryDocumentImport: mutation,
    useAbandonDocumentImport: mutation,
    useImportCost: () => ({ estimate: ref(null), isLoading: ref(false), isError: ref(false) }),
  };
});
vi.mock("@/components/campaign/DocumentImportWizard.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/campaign/DocumentImportPasteStep.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/campaign/ArchiveImportPanel.vue", () => ({ default: { template: "<div />" } }));

import DocumentImportTab from "./DocumentImportTab.vue";

async function upload(tickOwn: boolean) {
  const wrapper = mount(DocumentImportTab);
  const input = wrapper.find("input[type='file']");
  Object.defineProperty(input.element, "files", {
    value: [new File(["x"], "plan.pdf", { type: "application/pdf" })],
    configurable: true,
  });
  await input.trigger("change");
  await flushPromises();
  const boxes = wrapper.findAll("input[type='checkbox']");
  await boxes[0]?.setValue(true);
  if (tickOwn) await boxes[1]?.setValue(true);
  // The segmented "Upload" tab comes first; the submit button is the last one.
  await wrapper.findAll("button").filter((b) => b.text() === "Upload").at(-1)?.trigger("click");
  await flushPromises();
}

describe("DocumentImportTab upload own writing", () => {
  beforeEach(() => mocks.mutateAsync.mockReset().mockResolvedValue({}));

  it("sends ownWriting true when ticked", async () => {
    await upload(true);
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ sourceKind: "pdf", ownWriting: true }));
  });

  it("sends ownWriting false by default", async () => {
    await upload(false);
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ ownWriting: false }));
  });
});
