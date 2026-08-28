import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { CreditPackConfig, GenerationCreditCost } from "@/composables/billing/useCreditConfig";

export type { CreditPackConfig, GenerationCreditCost };

export function useAdminPricing() {
  const qc = useQueryClient();

  const packs = useQuery({
    queryKey: ["admin", "credit-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_pack_config")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as CreditPackConfig[];
    },
  });

  const generationCosts = useQuery({
    queryKey: ["admin", "generation-costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_generation_credit_costs")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as GenerationCreditCost[];
    },
  });

  const updatePack = useMutation({
    mutationFn: async (update: { pack_id: string; credits: number }) => {
      const { error } = await supabase
        .from("credit_pack_config")
        .update({ credits: update.credits })
        .eq("pack_id", update.pack_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "credit-packs"] });
      qc.invalidateQueries({ queryKey: ["credit-packs"] });
    },
  });

  const syncStripePrice = useMutation({
    mutationFn: async (args: { packId: string; stripePriceId: string; credits: number }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-sync-stripe-price`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        },
      );
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || "Sync failed");
      }
      return resp.json() as Promise<{
        stripe_price_id: string;
        stripe_unit_amount: number;
        stripe_currency: string;
        stripe_currency_options: unknown;
      }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "credit-packs"] });
      qc.invalidateQueries({ queryKey: ["credit-packs"] });
    },
  });

  const updateGenerationCost = useMutation({
    mutationFn: async (update: { generation_type: string; credit_cost: number }) => {
      const { error } = await supabase
        .from("ai_generation_credit_costs")
        .update({ credit_cost: update.credit_cost })
        .eq("generation_type", update.generation_type);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "generation-costs"] });
      qc.invalidateQueries({ queryKey: ["generation-credit-costs"] });
    },
  });

  return { packs, generationCosts, updatePack, syncStripePrice, updateGenerationCost };
}
