import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";

const rows = ref<Array<{ id: string; entry_id: string; part: string; title: string; deleted_at: string }>>([]);
const mocks = vi.hoisted(() => ({ restore: vi.fn(), forever: vi.fn(), confirm: vi.fn(), push: vi.fn() }));
vi.mock("@/composables/canon/useCanonTrash", () => ({
  useCanonTrash: () => ({ data: rows }),
  useRestoreCanonEntry: () => ({ mutateAsync: mocks.restore }),
  useDeleteForGood: () => ({ mutate: mocks.forever }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

import CanonDeleted from "./CanonDeleted.vue";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000 - 60_000).toISOString();
const row = (over: Partial<(typeof rows.value)[number]> = {}) => ({ id: "t1", entry_id: "e1", part: "secret", title: "Sift is the daughter", deleted_at: daysAgo(18), ...over });

describe("CanonDeleted", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    rows.value = [];
  });

  // Bug caught: an empty "Deleted (0)" disclosure on every Canon page.
  it("renders nothing when nothing is deleted", () => {
    expect(mount(CanonDeleted).find("[data-testid=canon-deleted]").exists()).toBe(false);
  });

  // Bug caught: the list hid how long a deleted entry is kept, so a DM could not tell what was about to be lost.
  it("names the entry, what it was, and the days left", () => {
    rows.value = [row()];
    const w = mount(CanonDeleted);
    expect(w.find("[data-testid=deleted-toggle]").text()).toContain("Deleted (1)");
    const text = w.find("[data-testid=deleted-row]").text();
    expect(text).toContain("Sift is the daughter");
    expect(text).toContain("a secret");
    expect(text).toContain("Kept 12 more days");
  });

  // Bug caught: Restore ran against the entry's id (gone) instead of the trash row, or left the DM on the list.
  it("restores by the trash row's id and goes to the restored entry", async () => {
    rows.value = [row()];
    mocks.restore.mockResolvedValue("e1");
    const w = mount(CanonDeleted);
    await w.find("[data-testid=deleted-restore]").trigger("click");
    await flushPromises();
    expect(mocks.restore).toHaveBeenCalledWith("t1");
    expect(mocks.push).toHaveBeenCalledWith({ path: "/canon", query: { entry: "e1" } });
  });

  // Bug caught: a refused restore (a new backstory exists) still navigated to an entry that is not there.
  it("goes nowhere when the restore is refused", async () => {
    rows.value = [row()];
    mocks.restore.mockRejectedValue(new Error("no"));
    const w = mount(CanonDeleted);
    await w.find("[data-testid=deleted-restore]").trigger("click");
    await flushPromises();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  // Bug caught: one stray click deleted an entry for good, past the only safety net.
  it("asks before deleting for good, and deletes nothing when cancelled", async () => {
    rows.value = [row()];
    mocks.confirm.mockResolvedValue(false);
    const w = mount(CanonDeleted);
    await w.find("[data-testid=deleted-forever]").trigger("click");
    await flushPromises();
    expect(mocks.confirm.mock.calls[0][0]).toBe("Delete this for good? It cannot be restored.");
    expect(mocks.forever).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue(true);
    await w.find("[data-testid=deleted-forever]").trigger("click");
    await flushPromises();
    expect(mocks.forever).toHaveBeenCalledWith("t1");
  });
});
