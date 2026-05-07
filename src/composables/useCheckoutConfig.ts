import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface CheckoutConfig {
  promo_codes_enabled: boolean;
}

export function useCheckoutConfig() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["checkout-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkout_config")
        .select("promo_codes_enabled")
        .single();
      if (error) throw error;
      return data as CheckoutConfig;
    },
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: async (promo_codes_enabled: boolean) => {
      const { error } = await supabase
        .from("checkout_config")
        .update({ promo_codes_enabled })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checkout-config"] }),
  });

  return { ...query, update };
}
