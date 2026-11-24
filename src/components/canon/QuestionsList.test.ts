import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { CanonEntry } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), updateAsync: vi.fn(), destroy: vi.fn(), confirm: vi.fn(), toastError: vi.fn(), connect: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
  useUpdateCanonEntry: () => ({ mutate: mocks.update, mutateAsync: mocks.updateAsync }),
  useTrashCanonEntry: () => ({ mutateAsync: mocks.destroy }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/canon/useEntryQuestLinks", () => ({ useEntryQuestLinks: () => ref([]) }));
vi.mock("@/composables/canon/useCanonWonders", () => ({ useCampaignWonders: () => ({ data: ref([]) }), useWonderActions: () => ({ takeUp: vi.fn(), letBe: vi.fn() }), isOpenWonder: () => true }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnection: () => ({ mutateAsync: mocks.connect }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));

vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: ref([]), isSuccess: ref(true) }) }));

import QuestionsList from "./QuestionsList.vue";

const q = (id: string, title: string): CanonEntry => canonEntry({ id, part: "question", title });
const answered = (): CanonEntry => canonEntry({ id: "q9", part: "question", title: "Who built the mill?", closed_as: "answered", closed_at: "t", closed_note: "The guild did.", became_entry_id: "t9" });
const mountList = (rows: CanonEntry[] = [q("q1", "Who made the Stain?")]) =>
  mount(QuestionsList, { props: { questions: rows }, global: { stubs: { CanonReview: true, RouterLink: { props: ["to"], template: "<a :data-to=\"JSON.stringify(to)\"><slot /></a>" } } } });
const submitButton = (w: ReturnType<typeof mountList>) => w.find("button[type=submit]");

describe("QuestionsList", () => {
  beforeEach(() => setActivePinia(createPinia()));
  beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

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

  async function openAnswerForm(w: ReturnType<typeof mountList>, text: string) {
    await w.find("[data-testid=answer-question]").trigger("click");
    await w.find("input[aria-label='The answer'], textarea[aria-label='The answer']").setValue(text);
  }

  // Bug caught (#1255 item 9): the answer was written to the question only, or the question was closed pointing at nothing.
  it("answering makes the entry first, then closes the question pointing at it", async () => {
    mocks.create.mockResolvedValue(q("new1", "x"));
    mocks.updateAsync.mockResolvedValue(undefined);
    const w = mountList();
    await openAnswerForm(w, "The guild did.");
    await w.find("[data-testid=question-answer-form]").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ part: "truth", knowledge: "all", title: "The guild did." });
    expect(mocks.updateAsync).toHaveBeenCalledWith({
      id: "q1",
      patch: expect.objectContaining({ closed_as: "answered", closed_note: "The guild did.", became_entry_id: "new1" }),
    });
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateAsync.mock.invocationCallOrder[0]);
  });

  // Bug caught (#1258 item 18): answering set became_entry_id but left no canon led_to link, so the answer was missing
  // from the question's Connections and the web.
  it("links the question to its answer with led_to", async () => {
    mocks.create.mockResolvedValue(q("new1", "The guild did."));
    mocks.updateAsync.mockResolvedValue(undefined);
    const w = mountList();
    await openAnswerForm(w, "The guild did.");
    await w.find("[data-testid=question-answer-form]").trigger("submit");
    await flushPromises();
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({
      subject: { kind: "canon", id: "q1" },
      other: expect.objectContaining({ kind: "canon", id: "new1" }),
      choice: expect.objectContaining({ key: "led_to", subjectIsFrom: true }),
    }));
  });

  // Bug caught: a question that could not be closed still got a link to its answer, so the two disagreed.
  it("writes no link when the question could not be closed", async () => {
    mocks.create.mockResolvedValue(q("new1", "x"));
    mocks.updateAsync.mockRejectedValue(new Error("no"));
    const w = mountList();
    await openAnswerForm(w, "The guild did.");
    await w.find("[data-testid=question-answer-form]").trigger("submit");
    await flushPromises();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  // Bug caught: a failed close rolled the new entry back (or threw unhandled), losing the DM's answer.
  it("keeps the new entry and says so when the question cannot be closed", async () => {
    mocks.create.mockResolvedValue(q("new1", "x"));
    mocks.updateAsync.mockRejectedValue(new Error("no"));
    const w = mountList();
    await openAnswerForm(w, "The guild did.");
    await w.find("[data-testid=question-answer-form]").trigger("submit");
    await flushPromises();
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("could not be closed"));
  });

  // Bug caught: closing the question although its answer was never made.
  it("closes nothing when the answer cannot be made, and keeps the form open", async () => {
    mocks.create.mockRejectedValue(new Error("no"));
    const w = mountList();
    await openAnswerForm(w, "The guild did.");
    await w.find("[data-testid=question-answer-form]").trigger("submit");
    await flushPromises();
    expect(mocks.updateAsync).not.toHaveBeenCalled();
    expect(w.find("[data-testid=question-answer-form]").exists()).toBe(true);
  });

  // Bug caught: an answered question still listed as open, still marked "nobody settles this by invention".
  it("lists an answered question under Answered, not among the open ones", () => {
    const w = mountList([q("q1", "Who made the Stain?"), answered()]);
    expect(w.findAll("[data-testid=kept-open]")).toHaveLength(1);
    expect(w.find("[data-testid=answered-toggle]").text()).toContain("Answered (1)");
    const row = w.get("[data-testid=answered-row]");
    expect(row.text()).not.toContain("nobody settles this by invention");
    expect(row.get("[data-testid=answered-as]").text()).toContain("Answered: The guild did.");
    expect(row.get("a").attributes("data-to")).toContain("t9");
  });

  // Bug caught: the answer linked to an entry that is gone (the FK clears the pointer), which opens nothing.
  it("shows the answer as plain text once what it became is gone", () => {
    const w = mountList([{ ...answered(), became_entry_id: null }]);
    expect(w.get("[data-testid=answered-row]").find("a").exists()).toBe(false);
    expect(w.get("[data-testid=answered-as]").text()).toContain("The guild did.");
  });

  // Bug caught: Reopen left closed_note set, which the table refuses.
  it("Reopen sends all four columns as null", async () => {
    const w = mountList([answered()]);
    await w.get("[data-testid=reopen-question]").trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "q9", patch: { closed_as: null, closed_at: null, closed_note: null, became_entry_id: null } });
  });
});

describe("QuestionsList find and order (#1255 item 11)", () => {
  beforeEach(() => { setActivePinia(createPinia()); Object.values(mocks).forEach((m) => m.mockReset()); mocks.updateAsync.mockResolvedValue(undefined); });
  const many = () => ["a", "b", "c", "d", "e", "f"].map((t, i) => canonEntry({ id: `q${i}`, part: "question", title: `Why ${t}?`, sort_order: i }));
  const mountMany = (props: Record<string, unknown> = {}) => mount(QuestionsList, { props: { questions: many(), ...props }, global: { stubs: { CanonReview: true } } });

  it("moves an open question up by swapping its place with the one before it", async () => {
    await mountMany().find("button[aria-label='Move Why c? up']").trigger("click");
    await flushPromises();
    expect(mocks.updateAsync.mock.calls.map(([c]) => [c.id, c.patch.sort_order])).toEqual([["q2", 1], ["q1", 2]]);
  });

  // Bug caught: moving inside a list an arc has narrowed, where "up" would swap with a row that is not on screen.
  it("hides the move buttons while an arc narrows the list", () => {
    expect(mountMany().find("[data-testid=move-buttons]").exists()).toBe(true);
    expect(mountMany({ arcLabel: "The drowned god" }).find("[data-testid=move-buttons]").exists()).toBe(false);
  });
});
