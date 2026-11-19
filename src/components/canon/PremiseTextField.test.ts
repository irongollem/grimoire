import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { CanonEntry } from "@/types/canon.types";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ createCanonEntry: mocks.create, updateCanonEntry: mocks.update }));
vi.mock("@tanstack/vue-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/vue-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import PremiseTextField from "./PremiseTextField.vue";

const entry = (title: string): CanonEntry => ({
  id: "v1", user_id: "u", campaign_id: "c1", part: "premise", premise_kind: "voice", knowledge: null, title, body: null,
  sort_order: 0, player_visible_to: [], image_url: null, ai_provenance: null, created_at: "", updated_at: "",
});

function mountField(saved?: CanonEntry) {
  return mount(PremiseTextField, {
    props: { kind: "voice", label: "Voice", placeholder: "", help: "", campaignId: "c1", ...(saved ? { entry: saved } : {}) },
  });
}
const box = (w: ReturnType<typeof mountField>) => w.find("textarea");

/** Long enough for the autosave's debounce to fire. */
async function settle() {
  await vi.advanceTimersByTimeAsync(2500);
  await flushPromises();
}

describe("PremiseTextField", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.create.mockResolvedValue({ id: "new" });
    mocks.update.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("creates no row for an empty box that was never saved, so touching it leaves no blank voice behind", async () => {
    const w = mountField();
    await box(w).setValue("   ");
    await settle();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates the voice on the first save", async () => {
    const w = mountField();
    await box(w).setValue("Dry and warm");
    await settle();
    expect(mocks.create).toHaveBeenCalledWith("c1", { part: "premise", premise_kind: "voice", title: "Dry and warm" });
  });

  it("updates the row the first save made on the second, never creating a duplicate", async () => {
    const w = mountField();
    await box(w).setValue("Dry");
    await settle();
    await box(w).setValue("Dry and warm");
    await settle();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith("new", { title: "Dry and warm" });
  });

  it("takes a change from elsewhere while nothing is typed", async () => {
    const w = mountField(entry("old"));
    await w.setProps({ entry: entry("from another tab") });
    expect((box(w).element as HTMLTextAreaElement).value).toBe("from another tab");
  });

  it("never overwrites unsaved typing with a change from elsewhere", async () => {
    const w = mountField(entry("old"));
    await box(w).setValue("my unsaved words");
    await w.setProps({ entry: entry("from another tab") });
    expect((box(w).element as HTMLTextAreaElement).value).toBe("my unsaved words");
  });
});
