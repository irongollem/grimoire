<template>
  <ul v-if="rolls.length > 0" class="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="species-habitats">
    <li v-for="r in rolls" :key="r.habitat.id" class="flex items-center gap-2">
      <AppButton variant="outline" size="sm" :icon="IconLocation" icon-size="xs" :label="r.habitat.name" :to="`/canon/life?habitat=${r.habitat.id}`" data-testid="species-habitat" />
      <span class="text-caption text-muted-foreground" data-testid="species-habitat-share">{{ r.percent === null ? "never met on a roll" : `met on a roll ${r.percent}%` }}</span>
    </li>
  </ul>
  <p v-else class="m-0 text-caption text-muted-foreground" data-testid="species-habitats-none">Not in any habitat yet. Add it to one under Habitats, in "What lives here".</p>
</template>

<script setup lang="ts">
/**
 * The habitats a species lives in (#1283): a button to each, opening it in the Habitats chapter, with how often the
 * species is met on that habitat's roll. Read only: a species is put in a habitat from the habitat.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { useCampaignSpecies } from "@/composables/canon/useCampaignSpecies";
import { habitatRolls } from "@/lib/canon/fieldGuide";
import type { Species } from "@/lib/canon/ecologyTypes";
import { IconLocation } from "@/lib/icons";

const { species } = defineProps<{ species: Species }>();
const { habitats, habitatSpecies, life } = useCampaignHabitats();
const { species: everyone } = useCampaignSpecies();

const rolls = computed(() => habitatRolls(species.id, habitats.value, habitatSpecies.value, life.value, new Map(everyone.value.map((s) => [s.id, s]))));
</script>
