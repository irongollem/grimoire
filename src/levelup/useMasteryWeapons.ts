import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useRuleset } from "@/composables/rules/useRuleset";
import { masteryWeaponsFor, type MasteryWeapon } from "./masteryWeapons";

interface MasteryWeaponRow {
  id: string;
  name: string;
  subtype: string | null;
  properties: string[];
}

async function fetchMasteryWeapons(): Promise<MasteryWeapon[]> {
  // Mastery is a 2024 property; a 2014 library row never carries one.
  const { data, error } = await supabase
    .from("library_items")
    .select("id, name, subtype, properties")
    .eq("item_type", "weapon")
    .not("mastery", "is", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as MasteryWeaponRow[];
}

/**
 * The library weapons that carry a mastery property, narrowed to what a class
 * is proficient with. Only a 2024 character is ever offered Weapon Mastery, so
 * a 2014 one never fires the read.
 */
export function useMasteryWeapons(proficiencies: MaybeRefOrGetter<readonly string[]>) {
  const { ruleset } = useRuleset();
  const query = useQuery({
    queryKey: ["library-mastery-weapons"] as const,
    queryFn: fetchMasteryWeapons,
    enabled: () => ruleset.value === "2024",
    staleTime: Infinity,
  });
  const weapons = computed(() => masteryWeaponsFor(query.data.value ?? [], toValue(proficiencies)));
  const idByName = computed(() => new Map(weapons.value.map((w) => [w.name, w.id])));
  const nameById = computed(() => new Map(weapons.value.map((w) => [w.id, w.name])));
  return { weapons, idByName, nameById, error: query.error };
}
