import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface ProviderConfig {
  provider: string;
  text_model: string | null;
  image_model: string | null;
  image_quality: string | null;
  audio_model: string | null;
  embedding_model: string | null;
  text_multiplier: number | null;
  image_multiplier: number | null;
  audio_multiplier: number | null;
  text_enabled: boolean;
  image_enabled: boolean;
  audio_enabled: boolean;
  embedding_enabled: boolean;
  updated_at: string;
}

export type ProviderConfigUpdate = Omit<ProviderConfig, "updated_at">;

export const PROVIDER_LABELS: Record<string, string> = {
  openai:    "OpenAI",
  anthropic: "Anthropic",
  gemini:    "Google Gemini",
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

  // Switches the active embedding vendor in one atomic statement via the
  // set_embedding_provider RPC (migration 20260803000001) instead of the two
  // ordinary .update() calls (disable old vendor, enable new one) that make
  // the invalid "two vendors enabled" state briefly reachable. SECURITY
  // INVOKER: provider_config's existing admin-only RLS policy authorises the
  // call, so a non-admin caller updates zero rows and the RPC raises.
  const setEmbeddingProvider = useMutation({
    mutationFn: async (vars: { provider: string; model: string }) => {
      const { error } = await supabase.rpc("set_embedding_provider", {
        p_provider: vars.provider,
        p_model: vars.model,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "provider-config"] });
      qc.invalidateQueries({ queryKey: ["provider-config"] });
    },
  });

  return { query, update, setEmbeddingProvider };
}
