import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { CurrencyOption } from "@/types/subscription.types";

export interface CreditPackConfig {
  pack_id: string;
  label: string;
  credits: number;
  eur_display: number;
  sort_order: number;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  stripe_unit_amount: number | null;
  stripe_currency: string | null;
  stripe_currency_options: Record<string, CurrencyOption> | null;
}

/**
 * Provider-neutral image quality tier for an image generation type, set
 * beside its credit cost in Admin -> Pricing. Mapped to each provider's own
 * value by supabase/functions/_shared/imageQuality.ts. Null means "use the
 * provider's own default" (provider_config.image_quality) — irrelevant for
 * non-image generation types, which always carry null here.
 */
export type ImageQualityTier = "low" | "standard" | "high";

export interface GenerationCreditCost {
  generation_type: string;
  label: string;
  credit_cost: number;
  image_quality_tier: ImageQualityTier | null;
}

export function useCreditPacks() {
  return useQuery({
    queryKey: ["credit-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_pack_config")
        .select("pack_id, label, credits, eur_display, sort_order, stripe_price_id, stripe_product_id, stripe_unit_amount, stripe_currency, stripe_currency_options")
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
        .select("generation_type, label, credit_cost, image_quality_tier")
        .order("sort_order");
      if (error) throw error;
      return data as GenerationCreditCost[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
