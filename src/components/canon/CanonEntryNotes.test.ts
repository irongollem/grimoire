import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ updateCanonEntry: mocks.save }));

vi.mock("@/composables/notes/useEntityMentionItems", () => ({ useEntityMentionItems: () => ({ mentionItems: ref([{ id: "n1", entityType: "npc", label: "Maren Voss" }]) }) }));

import CanonEntryNotes from "./CanonEntryNotes.vue";

// The real editor is Tiptap; a plain input stands in for its v-model.
const EditorStub = {
  name: "RichTextEditor",
  props: ["modelValue", "entityMentionItems"],
  emits: ["update:modelValue"],
  template: `<input data-testid="editor" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`,
};

const entryWith = (body: string | null) => canonEntry({ id: "f1", part: "force", title: "The Guild", body });
const mountNotes = (body: string | null) =>
  mount(CanonEntryNotes, {
    props: { entry: entryWith(body), label: "Notes", help: "Never shown to players.", placeholder: "…" },
    global: { stubs: { RichTextEditor: EditorStub } },
  });
const editorValue = (w: ReturnType<typeof mountNotes>) => (w.find("[data-testid=editor]").element as HTMLInputElement).value;

describe("CanonEntryNotes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.save.mockReset();
    mocks.save.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  // Bug caught: the notes saved into another field (or another entry), so a force's notes never came back.
  it("saves an edit as the body of that entry", async () => {
    const w = mountNotes(null);
    await w.find("[data-testid=editor]").setValue("The guild bribes the harbour.");
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.save).toHaveBeenCalledWith("f1", { body: "The guild bribes the harbour." });
  });

  // Bug caught: a change from another tab was ignored, so the DM kept editing a stale copy.
  it("takes a change from elsewhere while nothing is unsaved", async () => {
    const w = mountNotes("old");
    await w.setProps({ entry: entryWith("from another tab") });
    expect(editorValue(w)).toBe("from another tab");
  });

  // Bug caught: a change from elsewhere overwrote words the DM had typed and not yet saved.
  it("keeps unsaved typing over a change from elsewhere", async () => {
    const w = mountNotes("old");
    await w.find("[data-testid=editor]").setValue("my unsaved words");
    await w.setProps({ entry: entryWith("from another tab") });
    await flushPromises();
    expect(editorValue(w)).toBe("my unsaved words");
  });

  // Bug: canon text had no @, so the DM could not name a person, place or faction in it.
  it("offers the campaign's people, places and factions as @mentions", () => {
    const w = mountNotes(null);
    expect(w.findComponent({ name: "RichTextEditor" }).props("entityMentionItems")).toEqual([{ id: "n1", entityType: "npc", label: "Maren Voss" }]);
  });
});
