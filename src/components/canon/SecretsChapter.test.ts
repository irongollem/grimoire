import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { canonEntry } from "@/test/canonEntry";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const mocks = vi.hoisted(() => ({ create: vi.fn(), reorder: vi.fn() }));
const clues = ref<CanonClue[]>([]);
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
  useUpdateCanonEntry: () => ({ mutateAsync: mocks.reorder }),
}));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => ({ data: clues }) }));
vi.mock("@/composables/ask/useCanAsk", () => ({ useCanAsk: () => ref(true) }));

import SecretsChapter from "./SecretsChapter.vue";
import { useCanonUiStore } from "@/stores/ui/canon";

const SecretDetailStub = { name: "SecretDetail", props: ["entry"], emits: ["close", "delete"], template: "<div data-testid='detail'><button data-testid='detail-delete' @click=\"$emit('delete')\" /></div>" };
const QuestionsStub = { name: "QuestionsList", props: ["questions", "arcLabel"], template: "<div data-testid='questions' />" };

const secret = (id: string, order: number, revealed = false) => canonEntry({ id, part: "secret", title: id, sort_order: order, revealed_at: revealed ? "t" : null });
const clue = (id: string, secretId: string, found: boolean): CanonClue => ({
  id, user_id: "u", campaign_id: "c", secret_id: secretId, title: id, sort_order: 0, location_id: null, npc_id: null, quest_beat_id: null,
  found_at: found ? "t" : null, item_id: null, document_id: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: "", updated_at: "",
});

function mountChapter(props: { secrets?: CanonEntry[]; questions?: CanonEntry[]; selected?: CanonEntry | null; arcLabel?: string | null } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(SecretsChapter, {
    props: { secrets: [], questions: [], ...props },
    global: { plugins: [pinia], stubs: { CanonReview: true, SecretDetail: SecretDetailStub, QuestionsList: QuestionsStub } },
  });
}

describe("SecretsChapter", () => {
  beforeEach(() => { mocks.create.mockReset(); mocks.reorder.mockReset(); mocks.reorder.mockResolvedValue(undefined); clues.value = []; });

  it("adds a secret, empties the box and opens the new secret", async () => {
    mocks.create.mockResolvedValue({ id: "s9" });
    const w = mountChapter();
    const input = w.find("input[aria-label='A new secret']");
    await input.setValue("  Sift is the guild master's daughter. ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ part: "secret", title: "Sift is the guild master's daughter.", sort_order: 0 });
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(w.emitted("select")?.[0]).toEqual(["s9"]);
  });

  it("keeps the words and selects nothing when the create fails", async () => {
    mocks.create.mockImplementation(() => Promise.reject(new Error("no")));
    const w = mountChapter();
    const input = w.find("input[aria-label='A new secret']");
    await input.setValue("The Stain is a wound.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe("The Stain is a wound.");
    expect(w.emitted("select")).toBeUndefined();
  });

  // Bug caught (#1255 item 10): revealed secrets stayed in the middle of the ledger, so it did not read "still to find" first.
  it("lists revealed secrets after the ones still to find", () => {
    const w = mountChapter({ secrets: [secret("Revealed one", 0, true), secret("Hidden one", 1)] });
    const rows = w.get("[data-testid=secret-ledger]").findAll("li");
    expect(rows[0].text()).toContain("Hidden one");
    expect(rows[1].text()).toContain("Revealed one");
  });

  // Bug caught: the row's sign said nothing about the clues, or counted another secret's.
  it("marks a row with a sign and how many of its own clues are found, or Revealed", () => {
    clues.value = [clue("k1", "a", true), clue("k2", "a", false), clue("k3", "other", true)];
    const w = mountChapter({ secrets: [secret("a", 0), secret("b", 1), secret("c", 2, true)] });
    const marks = w.findAll("[data-testid=secret-state]").map((m) => m.text());
    expect(marks).toEqual(["◐ 1 of 2 found", "○ No clues", "● Revealed"]);
  });

  describe("order", () => {
    const list = [secret("s1", 0), secret("s2", 1, true), secret("s3", 2)];

    // Bug caught: a secret moving past a revealed one, where the ledger (revealed after the rest) would show no change.
    it("moves a secret among those in its own state, never past a revealed one", async () => {
      await mountChapter({ secrets: list }).find("button[aria-label='Move s3 up']").trigger("click");
      await flushPromises();
      expect(mocks.reorder.mock.calls.map(([c]) => [c.id, c.patch.sort_order])).toEqual([["s3", 0], ["s1", 2]]);
    });

    it("gives the last unrevealed secret no Down, since the revealed one after it is not in its group", () => {
      expect(mountChapter({ secrets: list }).find("button[aria-label='Move s3 down']").attributes("disabled")).toBeDefined();
    });

    it("offers no move buttons under an arc", () => {
      expect(mountChapter({ secrets: list, arcLabel: "The guild" }).find("[data-testid=move-buttons]").exists()).toBe(false);
    });
  });

  describe("secrets and questions", () => {
    // Bug caught: the switch did nothing, or left the secret add row under the questions.
    it("shows the questions in place of the secrets, with no secret add row", async () => {
      const w = mountChapter({ secrets: [secret("s1", 0)], questions: [canonEntry({ id: "q1", part: "question" })] });
      expect(w.find("[data-testid=questions]").exists()).toBe(false);
      await w.findAll("button").find((b) => b.text() === "Questions")!.trigger("click");
      expect(w.find("[data-testid=questions]").exists()).toBe(true);
      expect(w.find("[data-testid=secret-ledger]").exists()).toBe(false);
      expect(w.find("input[aria-label='A new secret']").exists()).toBe(false);
      expect(useCanonUiStore().secretsView).toBe("questions");
    });

    // Bug caught: the view is a view, not a filter: choosing Questions lit the page's Clear button.
    it("is not an active filter", () => {
      mountChapter();
      const store = useCanonUiStore();
      store.secretsView = "questions";
      expect(store.hasActiveFilters).toBe(false);
    });

    // Bug caught: opening a secret from a link while on Questions showed the questions with a secret open beside them.
    it("brings the chapter back to the secrets when a secret is opened", async () => {
      const w = mountChapter({ secrets: [secret("s1", 0)] });
      useCanonUiStore().secretsView = "questions";
      await w.setProps({ selected: secret("s1", 0) });
      await nextTick();
      expect(useCanonUiStore().secretsView).toBe("secrets");
      expect(w.find("[data-testid=secret-ledger]").exists()).toBe(true);
    });
  });

  describe("the open secret", () => {
    // Bug caught: the entry never opened beside the list, or the Back button did not close it.
    it("opens beside the list, and closes and deletes through the chapter", async () => {
      const open = secret("s1", 0);
      const w = mountChapter({ secrets: [open], selected: open });
      expect(w.getComponent(SecretDetailStub).props("entry")).toMatchObject({ id: "s1" });
      await w.get("[data-testid=detail-delete]").trigger("click");
      expect(w.emitted("delete")).toHaveLength(1);
      await w.get("[data-testid=canon-chapter-back]").trigger("click");
      expect(w.emitted("close")).toHaveLength(1);
    });

    it("opens a secret by selecting its row", async () => {
      const w = mountChapter({ secrets: [secret("s1", 0)] });
      await w.get("[data-testid=secret-ledger] button[aria-pressed]").trigger("click");
      expect(w.emitted("select")?.[0]).toEqual(["s1"]);
    });
  });
});
