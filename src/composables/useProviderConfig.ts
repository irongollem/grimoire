import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface ProviderConfigRow {
  provider: string;
  text_model: string | null;
  image_model: string | null;
  text_multiplier: number | null;
  image_multiplier: number | null;
  text_enabled: boolean;
  image_enabled: boolean;
}

export const PROVIDER_DISPLAY: Record<string, string> = {
  openai:    "OpenAI",
  anthropic: "Anthropic — Claude Haiku 3",
  gemini:    "Google Gemini",
  falai:     "fal.ai — FLUX",
};

export function useProviderConfig() {
  const query = useQuery({
    queryKey: ["provider-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_config")
        .select("provider, text_model, image_model, text_multiplier, image_multiplier, text_enabled, image_enabled")
        .order("provider");
      if (error) throw error;
      return data as ProviderConfigRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows = computed(() => query.data.value ?? []);

  const enabledImageProviders = computed(() =>
    rows.value.filter((r) => r.image_enabled && r.image_model),
  );

  const enabledTextProviders = computed(() =>
    rows.value.filter((r) => r.text_enabled && r.text_model),
  );

  function rowFor(provider: string): ProviderConfigRow | undefined {
    return rows.value.find((r) => r.provider === provider);
  }

  function textMultiplierFor(provider: string): number {
    return rowFor(provider)?.text_multiplier ?? 1.0;
  }

  function imageMultiplierFor(provider: string): number {
    return rowFor(provider)?.image_multiplier ?? 1.0;
  }

  return {
    query,
    rows,
    enabledImageProviders,
    enabledTextProviders,
    textMultiplierFor,
    imageMultiplierFor,
  };
}
