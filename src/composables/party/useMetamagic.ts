import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useRuleset } from "@/composables/rules/useRuleset";
import { toMetamagicOption, type MetamagicOption, type MetamagicOptionRow } from "@/rules/metamagic";

async function fetchMetamagicOptions(): Promise<MetamagicOptionRow[]> {
  const { data, error } = await supabase
    .from("metamagic_options")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as MetamagicOptionRow[];
}

/** Ruleset-aware Metamagic options, single-sourced from the metamagic_options table. */
export function useMetamagicOptions() {
  const { ruleset } = useRuleset();
  const query = useQuery({
    queryKey: ["metamagicOptions"],
    queryFn: fetchMetamagicOptions,
    staleTime: Infinity,
  });
  const options = computed<MetamagicOption[]>(() =>
    (query.data.value ?? [])
      .filter((option) => option.ruleset === ruleset.value)
      .map(toMetamagicOption),
  );
  const optionsByName = computed(() => new Map(options.value.map((option) => [option.name, option])));
  return { options, optionsByName, isLoading: query.isLoading };
}
