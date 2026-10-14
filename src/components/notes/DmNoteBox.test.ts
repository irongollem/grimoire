import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, reactive, ref } from "vue";
import { useScratchpadStore } from "@/stores/scratchpad";
import DmNoteBox from "./DmNoteBox.vue";

const seen = vi.hoisted(() => ({
  subjects: [] as unknown[],
  loading: { value: false },
  others: { value: [] as Array<{ id: string; heading: string; content: string }> },
  content: { value: null as string | null },
}));

vi.mock("@/composables/notes/useOtherDmNotes", () => ({
  useOtherDmNotes: () => ({ notes: computed(() => seen.others.value), isLoading: ref(false) }),
}));

vi.mock("@/composables/notes/useDmNote", () => ({
  useDmNote: (subject: () => unknown) => {
    seen.subjects.push(subject);
    return {
      draft: reactive({ content: seen.content.value }),
      status: computed(() => "saved"),
      saveError: computed(() => ""),
      revision: ref(0),
      loading: computed(() => seen.loading.value),
    };
  },
}));

const stubs = {
  RichTextViewer: { props: ["content"], template: "<div data-test='viewer'>{{ content }}</div>" },
  RichTextEditor: { template: "<div data-test='editor' />" },
  AutosaveStatus: { template: "<div data-test='status' />" },
};

const props = { type: "npc", id: "n1", label: "Brenna" } as const;

describe("DmNoteBox", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seen.subjects.length = 0;
    seen.loading.value = false;
    seen.others.value = [];
    seen.content.value = null;
  });

  // A co-DM on the owner's library row (#590): the row's write matches nothing
  // under RLS, so the note shows without an editor, a save status, or a
  // scratchpad entry that would offer to edit it after all.
  it("shows a read-only note with no editor, status or scratchpad entry", () => {
    seen.content.value = "<p>Lies about Garagai.</p>";
    const store = useScratchpadStore();
    const w = mount(DmNoteBox, { props: { ...props, readonly: true }, global: { stubs } });
    expect(w.find("[data-test=editor]").exists()).toBe(false);
    expect(w.find("[data-test=status]").exists()).toBe(false);
    expect(w.find("[data-test=viewer]").text()).toContain("Lies about Garagai.");
    expect(store.pageSubject).toBeNull();
  });

  it("renders the editor and registers its entity with the scratchpad", () => {
    const store = useScratchpadStore();
    const w = mount(DmNoteBox, { props, global: { stubs } });
    expect(w.find("[data-test=editor]").exists()).toBe(true);
    expect(w.text()).toContain("DM notes");
    expect(w.text()).toContain("Players never see this");
    expect(store.pageSubject).toEqual(props);
    w.unmount();
    expect(store.pageSubject).toBeNull();
  });

  it("re-registers when the entity changes", async () => {
    const store = useScratchpadStore();
    const w = mount(DmNoteBox, { props, global: { stubs } });
    await w.setProps({ id: "n2", label: "Tam" });
    expect(store.pageSubjects).toHaveLength(1);
    expect(store.pageSubject).toMatchObject({ id: "n2" });
  });

  it("yields to the scratchpad instead of rendering a second editor", async () => {
    const store = useScratchpadStore();
    const w = mount(DmNoteBox, { props, global: { stubs } });
    store.toggle();
    await flushPromises();
    expect(w.find("[data-test=editor]").exists()).toBe(false);
    expect(w.text()).toContain("Open in the scratchpad");
    const getter = seen.subjects[0] as () => unknown;
    expect(getter()).toBeNull();
  });

  it("the panel variant neither registers nor yields", async () => {
    const store = useScratchpadStore();
    store.toggle();
    const w = mount(DmNoteBox, { props: { ...props, variant: "panel" }, global: { stubs } });
    expect(w.find("[data-test=editor]").exists()).toBe(true);
    expect(store.pageSubjects).toHaveLength(0);
    expect(w.text()).not.toContain("Open in the scratchpad");
  });

  it.each(["inline", "panel"] as const)("shows no save status in the %s variant until the note has loaded", async (variant) => {
    seen.loading.value = true;
    const w = mount(DmNoteBox, { props: { ...props, variant }, global: { stubs } });
    expect(w.find("[data-test=status]").exists()).toBe(false);
    expect(w.find("[data-test=editor]").exists()).toBe(false);
  });

  it("shows the save status once the note has loaded", () => {
    const w = mount(DmNoteBox, { props, global: { stubs } });
    expect(w.find("[data-test=status]").exists()).toBe(true);
  });

  it("shows nothing extra when no other DM has written a note", () => {
    const w = mount(DmNoteBox, { props, global: { stubs } });
    expect(w.find("[data-test=other-dm-note]").exists()).toBe(false);
  });

  it.each(["inline", "panel"] as const)("lists each co-DM's note read-only in the %s variant", (variant) => {
    seen.others.value = [{ id: "a", heading: "Jeffrey's note", content: "the innkeeper is the cult leader" }];
    const w = mount(DmNoteBox, { props: { ...props, variant }, global: { stubs } });
    const other = w.get("[data-test=other-dm-note]");
    expect(other.attributes("data-hand")).toBeDefined();
    expect(other.text()).toContain("Jeffrey's note");
    expect(other.find("[data-test=viewer]").text()).toContain("innkeeper");
    expect(other.find("[data-test=editor]").exists()).toBe(false);
    expect(w.findAll("[data-test=editor]")).toHaveLength(1);
  });
});
