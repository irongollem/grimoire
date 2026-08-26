import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface CalibrationHint {
  generation_type: string;
  /** The 1024-square base in `ai_generation_credit_costs`, not the effective charge. */
  current_cost: number;
  /** What one render of this type actually cost, at whatever size it was made. */
  avg_actual_usd_cents: number;
  /** Total spend per time we charged, normalised to a 1024-square render — the
   *  unit `current_cost` has to cover. Differs from the average above wherever
   *  one payment buys several calls, such as a tile slot's free retries. */
  cost_per_charge_usd_cents: number;
  /** Credits that exactly cover cost. The floor: below it we lose money on every
   *  call. Null until 20 charges. */
  breakeven_cost: number | null;
  /** `breakeven_cost` × the configured target margin — the price we think is
   *  fair, and what the panel measures against in both directions. */
  suggested_cost: number | null;
  /** Times we charged, not rows recorded. */
  sample_size: number;
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
