import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface ProviderConfig {
  provider: string;
  text_model: string | null;
  image_model: string | null;
  audio_model: string | null;
  text_multiplier: number | null;
  image_multiplier: number | null;
  audio_multiplier: number | null;
  text_enabled: boolean;
  image_enabled: boolean;
  audio_enabled: boolean;
  updated_at: string;
}

export type ProviderConfigUpdate = Omit<ProviderConfig, "updated_at">;

export const PROVIDER_LABELS: Record<string, string> = {
  openai:    "OpenAI",
  anthropic: "Anthropic",
  gemini:    "Google Gemini",
  falai:     "fal.ai",
};

export function useAdminProviders() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "provider-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_config")
        .select("*")
        .order("provider");
      if (error) throw error;
      return data as ProviderConfig[];
    },
  });

  const update = useMutation({
    mutationFn: async (row: ProviderConfigUpdate) => {
      const { provider, ...fields } = row;
      const { error } = await supabase
        .from("provider_config")
        .update(fields)
        .eq("provider", provider);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "provider-config"] });
      qc.invalidateQueries({ queryKey: ["provider-config"] });
    },
  });

  return { query, update };
}
