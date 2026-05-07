import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface ModelPricing {
  model: string;
  provider: string;
  model_type: "text" | "image" | "audio";
  input_cost_per_million_tokens: number | null;
  output_cost_per_million_tokens: number | null;
  image_input_cost_per_million_tokens: number | null;
  image_output_cost_per_million_tokens: number | null;
  cost_per_image_usd: number | null;
  notes: string | null;
  last_verified_at: string | null;
}

export function useAdminModelPricing() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "model-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_model_pricing")
        .select("model, provider, model_type, input_cost_per_million_tokens, output_cost_per_million_tokens, image_input_cost_per_million_tokens, image_output_cost_per_million_tokens, cost_per_image_usd, notes, last_verified_at")
        .order("provider")
        .order("model");
      if (error) throw error;
      return (data ?? []) as ModelPricing[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (row: {
      model: string;
      provider: string;
      model_type: "text" | "image" | "audio";
      input_cost_per_million_tokens?: number | null;
      output_cost_per_million_tokens?: number | null;
      image_input_cost_per_million_tokens?: number | null;
      image_output_cost_per_million_tokens?: number | null;
      cost_per_image_usd?: number | null;
      last_verified_at?: string | null;
    }) => {
      const { error } = await supabase
        .from("ai_model_pricing")
        .upsert(row, { onConflict: "model" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "model-pricing"] }),
  });

  return { query, upsert };
}
