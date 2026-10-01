<template>
  <slot :name="name" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { provideCharacterRuleset } from "@/composables/rules/useRuleset";
import { useSpeciesNameMap } from "@/composables/rules/useSpecies";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * Resolves the species name of ONE character in that character's own scope.
 *
 * A list that shows several characters cannot look a species up in a map built
 * at campaign scope: that map is filtered to the campaign's edition, so a
 * character of the other edition finds nothing (epic #943). Render each row's
 * name through this instead; TanStack Query dedupes by key, so two editions
 * cost at most two queries however many rows there are.
 */
const { member } = defineProps<{
  member: { ruleset: RulesetKey; campaign_id: string | null; species_id: string | null };
}>();

provideCharacterRuleset(() => member);
const speciesNameMap = useSpeciesNameMap();
const name = computed(() => (member.species_id ? (speciesNameMap.value.get(member.species_id) ?? null) : null));

defineSlots<{ default(props: { name: string | null }): unknown }>();
</script>
