import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { TABLE_QUESTIONS_KEY } from "@/lib/campaignLiveSync/registry";
import type { TableQuestion, TableQuestionAnswer, TableQuestionInsert } from "@/types/tableQuestion.types";

// No refetchInterval anywhere here: both tables ring the campaign doorbell, which
// invalidates TABLE_QUESTIONS_KEY (CLAUDE.md "Live Data").

function requireUserId(): string {
  const user = getCurrentUser();
  if (!user) throw new Error("table questions written without a signed-in user");
  return user.id;
}

/** Questions of the active campaign, newest first. */
export function useTableQuestions(opts?: {
  rollTableId?: MaybeRefOrGetter<string | null>;
  openOnly?: MaybeRefOrGetter<boolean>;
}) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const rollTableId = computed(() => (opts?.rollTableId === undefined ? null : toValue(opts.rollTableId)));
  const openOnly = computed(() => (opts?.openOnly === undefined ? false : toValue(opts.openOnly)));
  return useQuery({
    queryKey: computed(() => [TABLE_QUESTIONS_KEY, "questions", campaignId.value, rollTableId.value, openOnly.value] as const),
    queryFn: async ({ queryKey: [, , cid, tableId, open] }): Promise<TableQuestion[]> => {
      let q = supabase
        .from("table_questions")
        .select("*")
        .eq("campaign_id", cid!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (tableId) q = q.eq("roll_table_id", tableId);
      if (open) q = q.is("closed_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return data as TableQuestion[];
    },
    enabled: () => !!campaignId.value,
  });
}

/** Every answer to the given questions, as far as the caller's RLS lets them read. */
export function useTableQuestionAnswers(questionIds: MaybeRefOrGetter<readonly string[]>) {
  const ids = computed(() => [...toValue(questionIds)].sort());
  return useQuery({
    queryKey: computed(() => [TABLE_QUESTIONS_KEY, "answers", ids.value] as const),
    queryFn: async ({ queryKey: [, , qids] }): Promise<TableQuestionAnswer[]> => {
      const { data, error } = await supabase.from("table_question_answers").select("*").in("question_id", qids);
      if (error) throw error;
      return data as TableQuestionAnswer[];
    },
    enabled: () => ids.value.length > 0,
  });
}

function useQuestionMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TABLE_QUESTIONS_KEY] }),
  });
}

export function useSendTableQuestion() {
  return useQuestionMutation(async (input: TableQuestionInsert): Promise<TableQuestion> => {
    const { data, error } = await supabase
      .from("table_questions")
      .insert({ ...input, user_id: requireUserId() })
      .select()
      .single();
    if (error) throw error;
    return data as TableQuestion;
  });
}

async function updateQuestion(id: string, patch: Partial<Pick<TableQuestion, "closed_at" | "outcome_option_id" | "hidden">>) {
  const { error } = await supabase.from("table_questions").update(patch).eq("id", id);
  if (error) throw error;
}

export function useCloseTableQuestion() {
  return useQuestionMutation(({ id, outcomeOptionId }: { id: string; outcomeOptionId: string | null }) =>
    updateQuestion(id, { closed_at: new Date().toISOString(), outcome_option_id: outcomeOptionId }),
  );
}

export function useReopenTableQuestion() {
  return useQuestionMutation((id: string) => updateQuestion(id, { closed_at: null, outcome_option_id: null }));
}

export function useSetTableQuestionHidden() {
  return useQuestionMutation(({ id, hidden }: { id: string; hidden: boolean }) => updateQuestion(id, { hidden }));
}

export function useDeleteTableQuestion() {
  return useQuestionMutation(async (id: string) => {
    const { error } = await supabase.from("table_questions").delete().eq("id", id);
    if (error) throw error;
  });
}

/**
 * A pick or a vote: one answer per member, changed by choosing again. No
 * campaign_id is sent, the guard trigger fills it from the question (a BEFORE
 * trigger runs ahead of the RLS check, so the insert is not refused for its absence).
 */
export function useAnswerTableQuestion() {
  return useQuestionMutation(
    async ({ questionId, optionId, partyMemberId }: { questionId: string; optionId: string; partyMemberId: string | null }) => {
      const { error } = await supabase
        .from("table_question_answers")
        .upsert(
          { question_id: questionId, user_id: requireUserId(), option_id: optionId, party_member_id: partyMemberId },
          { onConflict: "question_id,user_id" },
        );
      if (error) throw error;
    },
  );
}

/** A roll question: the server rolls, so no option is sent. Returns the row to show what landed. */
export function useRollTableQuestion() {
  return useQuestionMutation(
    async ({ questionId, partyMemberId }: { questionId: string; partyMemberId: string | null }): Promise<TableQuestionAnswer> => {
      const { data, error } = await supabase
        .from("table_question_answers")
        .insert({ question_id: questionId, user_id: requireUserId(), party_member_id: partyMemberId })
        .select()
        .single();
      if (error) throw error;
      return data as TableQuestionAnswer;
    },
  );
}

/** A player withdrawing a pick or vote, or the DM resetting any answer (which is how a roll is rerolled). */
export function useDeleteTableAnswer() {
  return useQuestionMutation(async (answerId: string) => {
    const { error } = await supabase.from("table_question_answers").delete().eq("id", answerId);
    if (error) throw error;
  });
}

/** Records the companion made from a picked creature on the answer. */
export function useLinkAnswerCompanion() {
  return useQuestionMutation(async ({ answerId, companionId }: { answerId: string; companionId: string }) => {
    const { error } = await supabase.from("table_question_answers").update({ companion_id: companionId }).eq("id", answerId);
    if (error) throw error;
  });
}
