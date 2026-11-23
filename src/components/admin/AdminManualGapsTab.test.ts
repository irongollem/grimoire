import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualGap } from "@/composables/admin/useAdminManualGaps";
import { useAdminUiStore } from "@/stores/ui/admin";
import AdminManualGapsTab from "./AdminManualGapsTab.vue";

const gaps = ref<ManualGap[]>([]);
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  markCovered: vi.fn(),
  reopen: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/composables/admin/useAdminManualGaps", () => ({
  useAdminManualGaps: () => ({ data: gaps, isPending: ref(false), isError: ref(false) }),
  useManualGapActions: () => ({
    markCovered: { mutate: mocks.markCovered, isPending: ref(false) },
    reopen: { mutate: mocks.reopen, isPending: ref(false) },
    remove: { mutate: mocks.remove, isPending: ref(false) },
  }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), fromError: (_e: unknown, f: string) => f }),
}));

function gap(overrides: Partial<ManualGap>): ManualGap {
  return {
    id: "g1",
    question: "How do I share a map?",
    question_key: "share map",
    asked_count: 3,
    pages_checked: ["maps", "sharing"],
    first_asked_at: "2026-11-01T00:00:00Z",
    last_asked_at: "2026-11-02T00:00:00Z",
    covered_at: null,
    ...overrides,
  };
}

// The filter also has a "Covered" button, so look inside the gap cards only.
const button = (w: ReturnType<typeof mount>, label: string) =>
  w.findAll(".rounded-lg button").find((b) => b.text() === label);

beforeEach(() => {
  setActivePinia(createPinia());
  Object.values(mocks).forEach((m) => m.mockReset());
  gaps.value = [];
});

describe("AdminManualGapsTab", () => {
  // Bug caught: the Open filter showing covered rows, or hiding open ones.
  it("shows open gaps by default and hides covered ones until asked", async () => {
    gaps.value = [
      gap({ id: "open", question: "Open one" }),
      gap({ id: "done", question: "Done one", covered_at: "2026-11-10T00:00:00Z" }),
    ];
    const wrapper = mount(AdminManualGapsTab);
    expect(wrapper.text()).toContain("Open one");
    expect(wrapper.text()).not.toContain("Done one");

    useAdminUiStore().manualGapsStatus = "covered";
    await flushPromises();
    expect(wrapper.text()).toContain("Done one");
    expect(wrapper.text()).not.toContain("Open one");
    expect(button(wrapper, "Reopen")).toBeTruthy();
  });

  // Bug caught: the count, or the pages Ask checked, not reaching the admin.
  it("shows how often a question was asked and which pages were checked", () => {
    gaps.value = [gap({})];
    const text = mount(AdminManualGapsTab).text();
    expect(text).toContain("asked 3 times");
    expect(text).toContain("maps");
    expect(text).toContain("sharing");
  });

  // Bug caught: Covered wired to the wrong row or to Remove.
  it("Covered marks that gap", async () => {
    gaps.value = [gap({ id: "g7" })];
    const wrapper = mount(AdminManualGapsTab);
    await button(wrapper, "Mark covered")!.trigger("click");
    expect(mocks.markCovered).toHaveBeenCalledWith("g7", expect.any(Object));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  // Bug caught: a cancelled confirm that still deletes.
  it("Remove asks first, and a cancelled confirm deletes nothing", async () => {
    gaps.value = [gap({ id: "g7" })];
    const wrapper = mount(AdminManualGapsTab);

    mocks.confirm.mockResolvedValue(false);
    await button(wrapper, "Remove")!.trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();

    mocks.confirm.mockResolvedValue(true);
    await button(wrapper, "Remove")!.trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith("g7", expect.any(Object));
  });

  it("says Ask has answered everything when nothing is open", () => {
    expect(mount(AdminManualGapsTab).text()).toContain(
      "No open gaps. Ask has answered everything it was asked about the app.",
    );
  });
});
