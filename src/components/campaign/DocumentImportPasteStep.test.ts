import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/composables/useToast", () => ({ useToast: () => ({ fromError: (_e: unknown, f: string) => f }) }));
vi.mock("@/composables/billing/useSubscription", () => ({ useSubscription: () => ({ isPro: ref(false) }) }));
vi.mock("@/composables/campaign/useDocumentImport", () => ({
  useCreateDocumentImport: () => ({ mutateAsync: mocks.mutateAsync, isPending: ref(false) }),
  useImportCost: () => ({ estimate: ref(null), isLoading: ref(false), isError: ref(false) }),
}));
vi.mock("@/lib/tiptap/tiptapToMarkdown", () => ({ tiptapToMarkdown: () => "A page of the DM's own plan." }));
vi.mock("@/components/campaign/DocumentPasteEditor.vue", () => ({
  default: { name: "DocumentPasteEditor", props: ["modelValue"], methods: { reset() {} }, template: "<div />" },
}));

import DocumentImportPasteStep from "./DocumentImportPasteStep.vue";

async function fillAndSubmit(tickOwn: boolean) {
  const wrapper = mount(DocumentImportPasteStep);
  await wrapper.find("input[type='text'], input:not([type])").setValue("My plan");
  const boxes = wrapper.findAll("input[type='checkbox']");
  await boxes[0]?.setValue(true);
  if (tickOwn) await boxes[1]?.setValue(true);
  const start = wrapper.findAll("button").find((b) => b.text().includes("Start import"));
  await start?.trigger("click");
  await flushPromises();
  return wrapper;
}

describe("DocumentImportPasteStep own writing", () => {
  beforeEach(() => mocks.mutateAsync.mockReset().mockResolvedValue({}));

  it("sends ownWriting true only when the box is ticked", async () => {
    await fillAndSubmit(true);
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ ownWriting: true }));
  });

  it("sends ownWriting false by default", async () => {
    await fillAndSubmit(false);
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ ownWriting: false }));
  });
});
