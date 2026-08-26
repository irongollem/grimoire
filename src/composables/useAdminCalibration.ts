import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface CalibrationHint {
  generation_type: string;
  /** The 1024-square base in `ai_generation_credit_costs`, not the effective charge. */
  current_cost: number;
  /** What a render of this type actually cost, at whatever size it was made. */
  avg_actual_usd_cents: number;
  /** The same, normalised to a 1024-square render — the only figure comparable
   *  to `current_cost`, and what `suggested_cost` derives from. See #773. */
  avg_baseline_usd_cents: number;
  sample_size: number;
  /** Credits that would break even, in EUR, valuing a credit at what it nets us
   *  in the cheapest pack. Null until 20 samples. */
  suggested_cost: number | null;
}

export function useAdminCalibration() {
  return useQuery({
    queryKey: ["admin", "calibration-hints"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_credit_calibration_hints");
      if (error) throw error;
      return (data ?? []) as CalibrationHint[];
    },
  });
}
