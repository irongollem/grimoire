import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface AbuseGuardConfig {
  enabled: boolean;
  enforce: boolean;
  young_account_days: number;
  window_hours: number;
  max_purchased_spend_window: number;
}

/** Admin read/update of the new-account velocity-guard config (singleton row). */
export function useAbuseGuard() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "abuse-guard"],
    queryFn: async (): Promise<AbuseGuardConfig | null> => {
      const { data, error } = await supabase
        .from("abuse_guard_config")
        .select("enabled, enforce, young_account_days, window_hours, max_purchased_spend_window")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data as AbuseGuardConfig | null;
    },
    staleTime: 60_000,
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<AbuseGuardConfig>) => {
      const { error } = await supabase.from("abuse_guard_config").update(patch).eq("id", 1);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "abuse-guard"] }),
  });

  return { query, update };
}
