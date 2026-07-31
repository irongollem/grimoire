import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useRuleset } from "@/composables/useRuleset";
import { defaultRitualStyle, type RitualStyle } from "@/rules/spellcastingPolicy";
import type { RulesetKey } from "@/types/ruleset.types";

interface ClassRitualPolicyRow {
  ruleset: RulesetKey;
  class_name: string;
  ritual_style: RitualStyle;
}

async function fetchRitualPolicies(): Promise<ClassRitualPolicyRow[]> {
  const { data, error } = await supabase.from("class_ritual_policies").select("*");
  if (error) throw error;
  return data as ClassRitualPolicyRow[];
}

/** Per-class ritual eligibility, single-sourced from the class_ritual_policies
 * table (the same data cast_character_spell_v4 enforces server-side). */
export function useRitualStyles() {
  const { ruleset } = useRuleset();
  const query = useQuery({
    queryKey: ["classRitualPolicies"],
    queryFn: fetchRitualPolicies,
    staleTime: Infinity,
  });

  /** Custom/homebrew classes and unseeded names use the edition default. */
  function ritualStyleFor(className: string, isOfficialClass: boolean): RitualStyle {
    if (!isOfficialClass) return defaultRitualStyle(ruleset.value);
    const row = (query.data.value ?? []).find(
      (policy) => policy.ruleset === ruleset.value && policy.class_name === className,
    );
    return row?.ritual_style ?? defaultRitualStyle(ruleset.value);
  }

  return { ritualStyleFor, isLoading: query.isLoading };
}
