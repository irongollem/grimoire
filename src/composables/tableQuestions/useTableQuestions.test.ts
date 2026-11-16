import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ campaignId: "camp-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() {
      return session.campaignId;
    },
  }),
}));

import { useAnswerTableQuestion, useTableQuestionAnswers, useTableQuestions } from "./useTableQuestions";

function inApp<T>(setup: () => T) {
  let result!: T;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mount(
    defineComponent({
      setup() {
        result = setup();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return result;
}

beforeEach(() => {
  fake.reset();
  session.campaignId = "camp-1";
});

describe("useTableQuestions", () => {
  it("reads only the active campaign's questions, newest first", async () => {
    fake.seed("table_questions", [
      { id: "old", campaign_id: "camp-1", created_at: "2026-01-01", closed_at: null },
      { id: "new", campaign_id: "camp-1", created_at: "2026-02-01", closed_at: null },
      { id: "other", campaign_id: "camp-2", created_at: "2026-03-01", closed_at: null },
    ]);
    const q = inApp(() => useTableQuestions());
    await flushPromises();
    expect(q.data.value?.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("leaves closed questions out when only open ones are asked for", async () => {
    fake.seed("table_questions", [
      { id: "open", campaign_id: "camp-1", created_at: "2026-01-01", closed_at: null },
      { id: "shut", campaign_id: "camp-1", created_at: "2026-02-01", closed_at: "2026-02-02" },
    ]);
    const q = inApp(() => useTableQuestions({ openOnly: true }));
    await flushPromises();
    expect(q.data.value?.map((r) => r.id)).toEqual(["open"]);
  });

  it("reads nothing while held back, so a dashboard card with no table chosen sends no request", async () => {
    fake.seed("table_questions", [{ id: "q", campaign_id: "camp-1", created_at: "2026-01-01", closed_at: null }]);
    const q = inApp(() => useTableQuestions({ enabled: false }));
    await flushPromises();
    expect(q.data.value).toBeUndefined();
    expect(q.fetchStatus.value).toBe("idle");
  });

  it("surfaces a database error rather than an empty list", async () => {
    fake.failNext("table_questions", { message: "boom" });
    const q = inApp(() => useTableQuestions());
    await flushPromises();
    expect(q.error.value).toMatchObject({ message: "boom" });
    expect(q.data.value).toBeUndefined();
  });
});

describe("useTableQuestionAnswers", () => {
  it("reads nothing for no questions", async () => {
    fake.seed("table_question_answers", [{ id: "a", question_id: "q1" }]);
    const q = inApp(() => useTableQuestionAnswers([]));
    await flushPromises();
    expect(q.data.value).toBeUndefined();
  });
});

describe("useAnswerTableQuestion", () => {
  it("changes an existing answer instead of adding a second one for the same member", async () => {
    fake.seed("table_question_answers", [{ id: "a1", question_id: "q1", user_id: "user-1", option_id: "x" }]);
    const m = inApp(() => useAnswerTableQuestion());
    await m.mutateAsync({ questionId: "q1", optionId: "y", partyMemberId: null });
    const rows = fake.rows("table_question_answers");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: "user-1", option_id: "y" });
  });
});
