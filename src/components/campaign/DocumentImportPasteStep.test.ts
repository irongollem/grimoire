import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";

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

import { useAskPrefillStore } from "@/stores/ui/askPrefill";
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
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.mutateAsync.mockReset().mockResolvedValue({});
  });

  it("sends ownWriting true only when the box is ticked", async () => {
    await fillAndSubmit(true);
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ ownWriting: true }));
  });

  it("sends ownWriting false by default", async () => {
    await fillAndSubmit(false);
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ ownWriting: false }));
  });
});

describe("DocumentImportPasteStep and what the DM told the Familiar", () => {
  beforeEach(() => setActivePinia(createPinia()));

  const offer = () => useAskPrefillStore().offer("document_import", "The Familiar asked: Where?\n\nI said: A drowned coast.", { ownWriting: "true", displayName: "Told to the Familiar" });
  const editorText = (w: ReturnType<typeof mount>) => JSON.stringify(w.findComponent({ name: "DocumentPasteEditor" }).props("modelValue"));

  // Bug caught: the told story not reaching the box, own writing left off (the story would be put in other words as
  // if it were a published book), or the rights box ticked for the DM (the attestation is theirs to give).
  it("fills the box, names the import and ticks own writing, but leaves the rights for the DM", () => {
    offer();
    const w = mount(DocumentImportPasteStep);
    expect(editorText(w)).toContain("I said: A drowned coast.");
    expect((w.find("input[type='text'], input:not([type])").element as HTMLInputElement).value).toBe("Told to the Familiar");
    const boxes = w.findAll("input[type='checkbox']");
    expect((boxes[0]!.element as HTMLInputElement).checked).toBe(false);
    expect((boxes[1]!.element as HTMLInputElement).checked).toBe(true);
    // Not started for them: the DM ticks the rights and presses Start, seeing the price.
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  // Bug caught: the hand-over kept after it was taken, so the next visit to the paste step refills a box the DM emptied.
  it("takes it once", () => {
    offer();
    mount(DocumentImportPasteStep);
    expect(mount(DocumentImportPasteStep).findAll("input[type='checkbox']")[1]!.element).toHaveProperty("checked", false);
  });
});
