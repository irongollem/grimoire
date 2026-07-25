import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

// "meshy" is managed from the Simulacrum panel (SimulacrumConfig.vue), and
// "github" from GithubIntegrationConfig.vue — neither is an AI provider, so
// both are deliberately absent from PROVIDERS below.
export type KeyProvider = "openai" | "anthropic" | "gemini" | "falai" | "meshy" | "github";

export interface PlatformKeyRow {
  provider: KeyProvider;
  updated_at: string;
}

export const PROVIDERS: { id: KeyProvider; label: string; hint: string }[] = [
  { id: "openai",    label: "OpenAI",    hint: "sk-…" },
  { id: "anthropic", label: "Anthropic", hint: "sk-ant-…" },
  { id: "gemini",    label: "Google Gemini", hint: "AIza…" },
  { id: "falai",     label: "Fal.ai",    hint: "…" },
];

export function useAdminKeys() {
  const qc = useQueryClient();

  const keysQuery = useQuery({
    queryKey: ["admin", "platform-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_api_keys")
        .select("provider, updated_at");
      if (error) throw error;
      return (data ?? []) as PlatformKeyRow[];
    },
  });

  const setKey = useMutation({
    mutationFn: async ({ provider, plaintext }: { provider: KeyProvider; plaintext: string }) => {
      const { data: enc, error: fnError } = await supabase.functions.invoke("api-key-vault", {
        body: { action: "encrypt", value: plaintext },
      });
      if (fnError) throw new Error(fnError.message);
      const encrypted_key = (enc as { result: string }).result;
      const { error } = await supabase
        .from("platform_api_keys")
        .upsert({ provider, encrypted_key }, { onConflict: "provider" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "platform-keys"] }),
  });

  const clearKey = useMutation({
    mutationFn: async (provider: KeyProvider) => {
      const { error } = await supabase
        .from("platform_api_keys")
        .delete()
        .eq("provider", provider);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "platform-keys"] }),
  });

  return { keysQuery, setKey, clearKey };
}
