import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerHandoutView from "./PlayerHandoutView.vue";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

const mocks = vi.hoisted(() => ({ markRead: vi.fn(), state: { doc: null as unknown, loading: false } }));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRoute: () => ({ params: { id: "h1" } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/scriptorium/usePlayerHandouts", () => ({
  usePlayerHandout: () => ({ data: ref(mocks.state.doc), isLoading: ref(mocks.state.loading) }),
}));
vi.mock("@/composables/play/useReadItems", () => ({ useMarkRead: () => ({ mutate: mocks.markRead }) }));

const doc = { id: "h1", title: "A Letter", updated_at: "2026-10-02T00:00:00Z" } as ScriptoriumDocument;

function mountView() {
  return mount(PlayerHandoutView, {
    global: { stubs: { ScriptoriumReader: { props: ["document", "audience", "backTo"], template: '<div data-testid="reader">{{ document.title }} {{ audience }} {{ backTo }}</div>' }, LoadingSpinner: true, AppButton: true } },
  });
}

describe("PlayerHandoutView", () => {
  beforeEach(() => {
    mocks.markRead.mockReset();
    mocks.state.doc = null;
    mocks.state.loading = false;
  });

  it("opens the handout in the player reader and marks it read", async () => {
    mocks.state.doc = doc;
    const w = mountView();
    await flushPromises();
    expect(w.get('[data-testid="reader"]').text()).toBe("A Letter player /play/journal?tab=handouts");
    expect(mocks.markRead).toHaveBeenCalledWith({ entityType: "handout", entityId: "h1" });
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
});
