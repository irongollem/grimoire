import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), destroy: vi.fn(), confirm: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
  useUpdateCanonEntry: () => ({ mutate: mocks.update }),
  useDeleteCanonEntry: () => ({ mutateAsync: mocks.destroy }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

import QuestionsList from "./QuestionsList.vue";

const q = (id: string, title: string): CanonEntry => canonEntry({ id, part: "question", title });
const mountList = () => mount(QuestionsList, { props: { questions: [q("q1", "Who made the Stain?")] }, global: { stubs: { CanonSuggestions: true } } });
const submitButton = (w: ReturnType<typeof mountList>) => w.find("button[type=submit]");

describe("QuestionsList", () => {
  beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

  it("marks every question as one nobody settles by invention", () => {
    expect(mountList().find("[data-testid=kept-open]").text()).toContain("nobody settles this by invention");
  });

  it("will not add a blank question", async () => {
    const w = mountList();
    expect(submitButton(w).attributes("disabled")).toBeDefined();
    await w.find("input[aria-label='A new open question']").setValue("Can the guild wake again?");
    expect(submitButton(w).attributes("disabled")).toBeUndefined();
  });

  it("adds the trimmed question as a question entry and empties the box", async () => {
    mocks.create.mockResolvedValue(q("q2", "x"));
    const w = mountList();
    const input = w.find("input[aria-label='A new open question']");
    await input.setValue("  Can the guild wake again?  ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ part: "question", title: "Can the guild wake again?", sort_order: 1 });
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("keeps the words in the box when the create fails, so they can be tried again", async () => {
    mocks.create.mockRejectedValue(new Error("no"));
    const w = mountList();
    const input = w.find("input[aria-label='A new open question']");
    await input.setValue("Can the guild wake again?");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe("Can the guild wake again?");
  });

  it("deletes nothing when the removal is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountList();
    await w.find("button[aria-label='Remove this question']").trigger("click");
    await flushPromises();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it("deletes the question once the removal is confirmed", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountList();
    await w.find("button[aria-label='Remove this question']").trigger("click");
    await flushPromises();
    expect(mocks.destroy).toHaveBeenCalledWith("q1");
  });
});
