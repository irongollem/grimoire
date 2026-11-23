import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

/**
 * One question about the app that Ask's manual could not answer.
 *
 * Holds no user and no campaign by design: the question is reworded without
 * names and folded by `question_key`, so `asked_count` says how often it comes
 * up. `covered_at` null means the gap is still open.
 */
export interface ManualGap {
  id: string;
  question: string;
  question_key: string;
  asked_count: number;
  /** Ids of the manual pages Ask looked at before giving up. */
  pages_checked: string[];
  first_asked_at: string;
  last_asked_at: string;
  covered_at: string | null;
}

const COLUMNS =
  "id, question, question_key, asked_count, pages_checked, first_asked_at, last_asked_at, covered_at";
const KEY = ["admin", "manual-gaps"] as const;

/**
 * Admin-only list of manual gaps, most-asked first.
 *
 * Read straight off the table: its policies let only the admin select, update
 * and delete, so no RPC is needed. `manual_gaps` is not in the generated
 * types yet, so the rows are typed here, as `useAdminBugReports` does.
 */
export function useAdminManualGaps() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ManualGap[]> => {
      const { data, error } = await supabase
        .from("manual_gaps")
        .select(COLUMNS)
        .order("asked_count", { ascending: false })
        .order("last_asked_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ManualGap[];
    },
    staleTime: 30_000,
  });
}

/** Covered, reopen and remove: each writes one row, then refetches the list. */
export function useManualGapActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  async function setCovered(id: string, coveredAt: string | null) {
    const { error } = await supabase.from("manual_gaps").update({ covered_at: coveredAt }).eq("id", id);
    if (error) throw error;
  }

  const markCovered = useMutation({
    mutationFn: (id: string) => setCovered(id, new Date().toISOString()),
    onSettled: refresh,
  });
  const reopen = useMutation({
    mutationFn: (id: string) => setCovered(id, null),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manual_gaps").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: refresh,
  });
  return { markCovered, reopen, remove };
}
