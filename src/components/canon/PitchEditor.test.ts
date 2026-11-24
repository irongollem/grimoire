import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ destroy: vi.fn(), confirm: vi.fn(), save: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useUpdateCanonEntry: () => ({ mutate: vi.fn() }),
  useTrashCanonEntry: () => ({ mutate: mocks.destroy }),
  updateCanonEntry: mocks.save,
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

vi.mock("@/composables/notes/useEntityMentionItems", () => ({ useEntityMentionItems: () => ({ mentionItems: ref([{ id: "n1", entityType: "npc", label: "Maren Voss" }]) }) }));

import PitchEditor from "./PitchEditor.vue";

const entry = (body: string | null): CanonEntry => canonEntry({ id: "p1", part: "premise", premise_kind: "pitch", title: "", body });

// The real editor is Tiptap; a plain input stands in for its v-model.
const EditorStub = {
  name: "RichTextEditor",
  props: ["modelValue", "entityMentionItems"],
  emits: ["update:modelValue"],
  template: `<input data-testid="editor" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
};

function mountEditor(body: string | null) {
  return mount(PitchEditor, {
    props: { entry: entry(body) },
    global: { stubs: { RichTextEditor: EditorStub, AudienceRevealControl: true } },
  });
}
const editorValue = (w: ReturnType<typeof mountEditor>) => (w.find("[data-testid=editor]").element as HTMLInputElement).value;

describe("PitchEditor", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.save.mockResolvedValue(undefined);
  });

  it("removes nothing when the confirm is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountEditor("old");
    await w.get("button[aria-label='Delete the pitch']").trigger("click");
    await flushPromises();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("removes the pitch when the confirm is accepted", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountEditor("old");
    await w.get("button[aria-label='Delete the pitch']").trigger("click");
    await flushPromises();
    expect(mocks.destroy).toHaveBeenCalledWith("p1");
  });

  it("takes a change that arrives from elsewhere while the DM has typed nothing", async () => {
    const w = mountEditor("old");
    await w.setProps({ entry: entry("from another tab") });
    expect(editorValue(w)).toBe("from another tab");
  });

  it("never overwrites what the DM has typed and not yet saved with a change from elsewhere", async () => {
    const w = mountEditor("old");
    await w.find("[data-testid=editor]").setValue("my unsaved words");
    await w.setProps({ entry: entry("from another tab") });
    expect(editorValue(w)).toBe("my unsaved words");
  });
});
