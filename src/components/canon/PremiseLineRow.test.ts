import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn(), destroy: vi.fn(), confirm: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useUpdateCanonEntry: () => ({ mutate: mocks.update }),
  useDeleteCanonEntry: () => ({ mutate: mocks.destroy }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

import PremiseLineRow from "./PremiseLineRow.vue";

const entry: CanonEntry = canonEntry({ id: "e1", part: "premise", premise_kind: "theme", title: "What is sweet can spoil." });

function mountRow() {
  return mount(PremiseLineRow, { props: { entry, label: "Theme" }, global: { stubs: { AudienceRevealControl: true } } });
}

describe("PremiseLineRow", () => {
  beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

  it("saves the new words once the field is left", async () => {
    const w = mountRow();
    await w.find("input").setValue("Kindness is courage.");
    await w.find("input").trigger("change");
    expect(mocks.update).toHaveBeenCalledWith({ id: "e1", patch: { title: "Kindness is courage." } });
  });

  it("puts the old words back on a blank edit and saves nothing, so a slip of the keys never blanks a theme", async () => {
    const w = mountRow();
    await w.find("input").setValue("   ");
    await w.find("input").trigger("change");
    expect(mocks.update).not.toHaveBeenCalled();
    expect((w.find("input").element as HTMLInputElement).value).toBe("What is sweet can spoil.");
  });

  it("saves nothing for an edit that leaves the words as they were", async () => {
    const w = mountRow();
    await w.find("input").setValue("  What is sweet can spoil.  ");
    await w.find("input").trigger("change");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("deletes nothing when the confirm is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    await mountRow().find("button[aria-label='Delete this entry']").trigger("click");
    await flushPromises();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("deletes the entry when the confirm is accepted", async () => {
    mocks.confirm.mockResolvedValue(true);
    await mountRow().find("button[aria-label='Delete this entry']").trigger("click");
    await flushPromises();
    expect(mocks.destroy).toHaveBeenCalledWith("e1");
  });
});
