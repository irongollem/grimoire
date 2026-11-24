import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CanonOpenAsBook from "./CanonOpenAsBook.vue";

const mocks = vi.hoisted(() => ({ start: vi.fn(), push: vi.fn(), error: vi.fn() }));
vi.mock("@/scriptorium/composables/useStartScriptoriumDocument", () => ({
  useStartScriptoriumDocument: () => ({ startBookFromCampaign: mocks.start, isStarting: ref(false) }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.error, fromError: (e: Error) => e.message }),
}));

describe("CanonOpenAsBook", () => {
  beforeEach(() => {
    mocks.start.mockReset();
    mocks.push.mockReset();
    mocks.error.mockReset();
  });

  // Bug caught: drawing the players' book (or none) from the DM's Canon, or not opening what was drawn.
  it("draws the DM's book and opens the new document", async () => {
    mocks.start.mockResolvedValue("doc-9");
    const w = mount(CanonOpenAsBook);
    await w.find("button").trigger("click");
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledWith("dm");
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium/doc-9");
  });

  // Bug caught: a failed draw navigating anyway, or failing silently.
  it("toasts the reason and stays put when drawing fails", async () => {
    mocks.start.mockRejectedValue(new Error("The campaign has nothing to draw a book from yet."));
    const w = mount(CanonOpenAsBook);
    await w.find("button").trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("The campaign has nothing to draw a book from yet.");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
