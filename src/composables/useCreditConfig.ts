import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface CreditPackConfig {
  pack_id: string;
  label: string;
  credits: number;
  eur_display: number;
  sort_order: number;
}

export interface GenerationCreditCost {
  generation_type: string;
  label: string;
  credit_cost: number;
}

export function useCreditPacks() {
  return useQuery({
    queryKey: ["credit-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_pack_config")
        .select("pack_id, label, credits, eur_display, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as CreditPackConfig[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useGenerationCreditCosts() {
  return useQuery({
    queryKey: ["generation-credit-costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_generation_credit_costs")
        .select("generation_type, label, credit_cost")
        .order("sort_order");
      if (error) throw error;
      return data as GenerationCreditCost[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
