import { flushPromises, mount } from "@vue/test-utils";
import { ref, toValue } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerHandoutView from "./PlayerHandoutView.vue";
import type { PlayerHandout } from "@/types/scriptorium.types";

const mocks = vi.hoisted(() => ({ markRead: vi.fn(), chapterRef: null as unknown, state: { doc: null as unknown, loading: false, current: null as { value: unknown } | null } }));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRoute: () => ({ params: { id: "h1" } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/scriptorium/usePlayerHandouts", () => ({
  usePlayerHandout: (_id: unknown, chapterId: unknown) => {
    const data = ref(mocks.state.doc);
    mocks.state.current = data;
    mocks.chapterRef = chapterId;
    return { data, isLoading: ref(mocks.state.loading), isFetching: ref(false), chapterId };
  },
}));
vi.mock("@/composables/player/useReadItems", () => ({ useMarkRead: () => ({ mutate: mocks.markRead }) }));

const doc = {
  id: "h1",
  title: "A Letter",
  updated_at: "2026-10-02T00:00:00Z",
  chapters: [{ id: "c1", position: 0, title: "Dear friends" }],
  chapter: { id: "c1", title: "Dear friends", content: { type: "doc", content: [] } },
} as unknown as PlayerHandout;

function mountView() {
  return mount(PlayerHandoutView, {
    global: { stubs: { ScriptoriumReader: { props: ["book", "chapters", "chapter", "audience", "backTo"], emits: ["selectChapter"], template: '<div data-testid="reader" @click="$emit(\'selectChapter\', \'c9\')">{{ book.title }} {{ chapters.length }} {{ chapter.title }} {{ audience }} {{ backTo }}</div>' }, LoadingSpinner: true, AppButton: true } },
  });
}

describe("PlayerHandoutView", () => {
  beforeEach(() => {
    mocks.markRead.mockReset();
    mocks.state.doc = null;
    mocks.state.loading = false;
    mocks.chapterRef = null;
  });

  it("reads the first chapter until the reader asks for another, then reads that one", async () => {
    mocks.state.doc = doc;
    const w = mountView();
    await flushPromises();
    expect(toValue(mocks.chapterRef as never)).toBeNull();
    await w.get('[data-testid="reader"]').trigger("click");
    // The query is keyed on the chapter: the view hands the RPC the chosen one.
    expect(toValue(mocks.chapterRef as never)).toBe("c9");
  });

  it("opens the handout in the player reader and marks it read", async () => {
    mocks.state.doc = doc;
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="reader"]').text()).toBe("A Letter 1 Dear friends player /play/journal?tab=handouts");
    expect(mocks.markRead).toHaveBeenCalledWith({ entityType: "handout", entityId: "h1" });
  });

  it("keeps the reader on screen while the next chapter loads, so it does not lose its place in the book", async () => {
    mocks.state.doc = doc;
    const w = mountView();
    await flushPromises();
    mocks.state.current!.value = undefined;
    await flushPromises();
    expect(w.find('[data-testid="reader"]').exists()).toBe(true);
    expect(w.text()).not.toContain("not available");
  });

  it("says not available for a withdrawn handout and marks nothing", async () => {
    const w = mountView();
    await flushPromises();
    expect(w.text()).toContain("Handout not available");
    expect(w.find('[data-testid="reader"]').exists()).toBe(false);
    expect(mocks.markRead).not.toHaveBeenCalled();
  });

  it("shows the spinner while the handout loads", () => {
    mocks.state.loading = true;
    const w = mountView();
    expect(w.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
    expect(w.text()).not.toContain("not available");
  });
  it("marks the handout read again when the DM edits it while it is open", async () => {
    mocks.state.doc = doc;
    mountView();
    await flushPromises();
    expect(mocks.markRead).toHaveBeenCalledTimes(1);
    mocks.state.current!.value = { ...doc, updated_at: "2026-10-03T09:00:00Z" };
    await flushPromises();
    expect(mocks.markRead).toHaveBeenCalledTimes(2);
  });
});
