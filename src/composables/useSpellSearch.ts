import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { refDebounced } from "@vueuse/core";
import { supabase } from "@/lib/supabase";
import type { Spell } from "@/types/spell.types";
import { useRuleset } from "@/composables/useRuleset";

/**
 * Columns the spell-picker row + emitted grant actually need: id/name/level/
 * school for the result list, the rest for mechanics-aware filtering
 * downstream (attack/save type, concentration, ritual, damage/healing dice).
 * Deliberately excludes description/higher_levels/etc. — over-fetching those
 * on every keystroke was the bug being fixed here.
 */
const SEARCH_COLUMNS = "id, name, level, school, attack_type, save_attribute, concentration, ritual, damage_rolls, healing_dice";

export interface UseSpellSearchOptions {
  /** Max results per source table, and of the final merged/sorted list. Defaults to 20. */
  limit?: number;
  /** Suppress the query even once the search term is long enough (e.g. a spell is already picked). */
  enabled?: MaybeRefOrGetter<boolean>;
}

/**
 * Debounced (300ms) dual-table spell name search — the custom `spells` table
 * plus the shared `srd_spells` table, both scoped to the active campaign
 * ruleset. Shared by AddInnateSpellDialog and SpeciesSpellGrants so both
 * spell-grant search forms fetch the same narrow column set instead of each
 * maintaining its own byte-identical `select("*")` queryFn.
 */
export function useSpellSearch(search: MaybeRefOrGetter<string>, options: UseSpellSearchOptions = {}) {
  const { limit = 20, enabled = true } = options;
  const { ruleset } = useRuleset();
  const debouncedSearch = refDebounced(computed(() => toValue(search)), 300);

  const query = useQuery({
    queryKey: computed(() => ["spellSearch", debouncedSearch.value, ruleset.value, limit]),
    queryFn: async () => {
      const q = debouncedSearch.value.trim();
      if (q.length < 2) return [] as Spell[];
      const [custom, shared] = await Promise.all([
        supabase.from("spells").select(SEARCH_COLUMNS).ilike("name", `%${q}%`)
          .or(`ruleset.is.null,ruleset.eq.${ruleset.value}`).limit(limit),
        supabase.from("srd_spells").select(SEARCH_COLUMNS).ilike("name", `%${q}%`)
          .eq("ruleset", ruleset.value).limit(limit),
      ]);
      if (custom.error) throw custom.error;
      if (shared.error) throw shared.error;
      return [
        ...((custom.data ?? []) as Spell[]),
        ...(shared.data ?? []).map((spell) => ({ ...spell, user_id: "" }) as Spell),
      ].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).slice(0, limit);
    },
    enabled: computed(() => debouncedSearch.value.length >= 2 && toValue(enabled)),
  });

  return {
    results: computed(() => query.data.value ?? []),
    isSearching: query.isFetching,
  };
}
