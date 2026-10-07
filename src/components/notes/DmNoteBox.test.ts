import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, reactive, ref } from "vue";
import { useScratchpadStore } from "@/stores/scratchpad";
import DmNoteBox from "./DmNoteBox.vue";

const seen = vi.hoisted(() => ({ subjects: [] as unknown[], loading: { value: false } }));

vi.mock("@/composables/notes/useDmNote", () => ({
  useDmNote: (subject: () => unknown) => {
    seen.subjects.push(subject);
    return {
      draft: reactive({ content: null }),
      status: computed(() => "saved"),
      saveError: computed(() => ""),
      revision: ref(0),
      loading: computed(() => seen.loading.value),
    };
  },
}));

const stubs = {
  RichTextEditor: { template: "<div data-test='editor' />" },
  AutosaveStatus: { template: "<div data-test='status' />" },
};

const props = { type: "npc", id: "n1", label: "Brenna" } as const;

describe("DmNoteBox", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seen.subjects.length = 0;
    seen.loading.value = false;
  });

  it("renders the editor and registers its entity with the scratchpad", () => {
    const store = useScratchpadStore();
    const w = mount(DmNoteBox, { props, global: { stubs } });
    expect(w.find("[data-test=editor]").exists()).toBe(true);
    expect(w.text()).toContain("DM notes");
    expect(w.text()).toContain("Only you see this");
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
});
