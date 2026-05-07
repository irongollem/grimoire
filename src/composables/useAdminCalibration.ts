import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface CalibrationHint {
  generation_type: string;
  current_cost: number;
  avg_actual_usd_cents: number;
  sample_size: number;
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
