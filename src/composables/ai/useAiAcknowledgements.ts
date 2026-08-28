import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

const UNIQUE_VIOLATION = "23505";

/**
 * EU AI Act Art 50(1) consent gateway — see context/compliance/provenance-architecture.md §3.
 * `ai_pro_reoffer`: the one-time free->Pro re-ask for campaigns where the
 * owner previously declined AI (context/compliance/ai-act.md §4, 4 Aug 2026).
 */
export type AiAcknowledgementKind = "ai_use" | "likeness" | "ai_pro_reoffer";

export interface AiAcknowledgementRow {
  id: string;
  user_id: string;
  kind: AiAcknowledgementKind;
  version: string;
  created_at: string;
  updated_at: string;
}

async function fetchMyAcknowledgements(userId: string): Promise<AiAcknowledgementRow[]> {
  const { data, error } = await supabase
    .from("ai_acknowledgements")
    .select("id, user_id, kind, version, created_at, updated_at")
    .eq("user_id", userId);
  if (error) throw error;
  return data as AiAcknowledgementRow[];
}

async function recordAcknowledgement(
  userId: string,
  kind: AiAcknowledgementKind,
  version: string,
): Promise<void> {
  const { error } = await supabase
    .from("ai_acknowledgements")
    .insert({ user_id: userId, kind, version });
  // Re-recording the same (user, kind, version) is not an error — the user
  // already acknowledged it, which is exactly the state we want.
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

/** Pure predicate, exported for testing without mocking Supabase/TanStack Query. */
export function findAcknowledgement(
  rows: AiAcknowledgementRow[],
  kind: AiAcknowledgementKind,
  version: string,
): boolean {
  return rows.some((row) => row.kind === kind && row.version === version);
}

const QUERY_KEY = ["ai-acknowledgements", "mine"];

/**
 * The user's `ai_acknowledgements` rows plus `hasAcknowledged`/`acknowledge`
 * helpers. Acknowledgements are per-account (not per-campaign, not
 * per-generation) and version-scoped: a version bump makes `hasAcknowledged`
 * false again until the user re-confirms.
 */
export function useAiAcknowledgements() {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    // Keep cached consent state scoped to the authenticated account. Without
    // the user id, a same-tab account switch can briefly expose the previous
    // account's rows while this query refetches.
    queryKey: computed(() => [...QUERY_KEY, userId.value ?? "signed-out"]),
    queryFn: () => fetchMyAcknowledgements(userId.value!),
    enabled: computed(() => !!userId.value),
    // A failed read must not fan out into several identical requests from
    // every acknowledgement observer. Gates handle this state explicitly and
    // a later reconnect/refocus can try again.
    retry: false,
    retryOnMount: false,
  });

  function hasAcknowledged(kind: AiAcknowledgementKind, version: string): boolean {
    return findAcknowledgement(query.data.value ?? [], kind, version);
  }

  const { mutateAsync } = useMutation({
    mutationFn: ({ kind, version }: { kind: AiAcknowledgementKind; version: string }) => {
      if (!userId.value) throw new Error("You must be signed in.");
      return recordAcknowledgement(userId.value, kind, version);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  function acknowledge(kind: AiAcknowledgementKind, version: string): Promise<void> {
    return mutateAsync({ kind, version });
  }

  return {
    acknowledgements: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasAcknowledged,
    acknowledge,
  };
}
