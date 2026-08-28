import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { SimulacrumConfig, SimulacrumMode } from "@/types/mini.types";

const QUERY_KEY = ["simulacrum-config"];

async function fetchConfig(): Promise<SimulacrumConfig | null> {
  const { data, error } = await supabase
    .from("simulacrum_config")
    .select("id, mode, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data as SimulacrumConfig | null;
}

/**
 * Feature-flag gate for the whole Simulacrum module. `mode` defaults to
 * "hidden" while the row is loading or absent, so every consumer (nav, entry
 * points, the wizard route) fails closed rather than briefly flashing live UI.
 */
export function useSimulacrumConfig() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchConfig,
    staleTime: 5 * 60 * 1000,
  });

  const mode = computed<SimulacrumMode>(() => query.data.value?.mode ?? "hidden");
  const isTeaser = computed(() => mode.value === "teaser");
  const isLive = computed(() => mode.value === "live");
  const isVisible = computed(() => mode.value !== "hidden");

  return { query, mode, isTeaser, isLive, isVisible };
}

/** Admin-only: flip the singleton's mode. */
export function useUpdateSimulacrumMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: SimulacrumMode) => {
      const { error } = await supabase.from("simulacrum_config").update({ mode }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
