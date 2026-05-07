import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { CreditPackConfig, GenerationCreditCost } from "./useCreditConfig";

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
    mutationFn: async (update: { pack_id: string; credits: number; eur_display: number; stripe_price_id?: string | null }) => {
      const payload: Record<string, unknown> = { credits: update.credits, eur_display: update.eur_display };
      if ("stripe_price_id" in update) payload.stripe_price_id = update.stripe_price_id ?? null;
      const { error } = await supabase
        .from("credit_pack_config")
        .update(payload)
        .eq("pack_id", update.pack_id);
      if (error) throw error;
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

  return { packs, generationCosts, updatePack, updateGenerationCost };
}
