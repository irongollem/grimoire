import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface CheckoutConfig {
  promo_codes_enabled: boolean;
  /** When false, the marketing site swaps its Pro CTAs for the waitlist form.
   *  Flipping it fires the marketing deploy hook (DB trigger) → site rebuilds. */
  pro_signup_open: boolean;
}

export function useCheckoutConfig() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["checkout-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkout_config")
        .select("promo_codes_enabled,pro_signup_open")
        .single();
      if (error) throw error;
      return data as CheckoutConfig;
    },
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<CheckoutConfig>) => {
      const { error } = await supabase.from("checkout_config").update(patch).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkout-config"] }),
  });

  return { ...query, update };
}
