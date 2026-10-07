<template>
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
    <RouterLink
      v-for="stat in stats"
      :key="stat.label"
      :to="stat.to"
      class="bg-card flex items-center gap-2.5 px-4 py-3 hover:bg-muted/20 transition-colors"
    >
      <component :is="stat.icon" class="h-4 w-4 text-muted-foreground/50 shrink-0" />
      <span class="text-body text-muted-foreground">{{ stat.label }}</span>
      <span class="ml-auto text-heading-sm font-bold text-foreground">{{ stat.value }}</span>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconNavAtlas, IconNavEncounters, IconNavNpcs, IconNavQuests } from "@/lib/icons";
import { useQuests } from "@/composables/quests/useQuests";
import { useCampaignCounts } from "@/composables/campaign/useCampaignCounts";

/** Counts, not a card: the strip is a set of links that happen to carry a
 *  number, so it deliberately skips DashboardWidget's chrome. The NPC, encounter
 *  and place figures are counted by the database (#999) rather than by loading
 *  each list; the quest list stays because the Quests widget on the same screen
 *  reads it anyway and the active count comes free from it. */
const { data: allQuests } = useQuests();
const { npcs, encounters, locations } = useCampaignCounts();

const stats = computed(() => [
  { label: "Active Quests", value: (allQuests.value ?? []).filter((q) => q.status === "active").length || "—", icon: IconNavQuests, to: "/quests" },
  { label: "NPCs",          value: npcs.data.value ?? "—",       icon: IconNavNpcs,       to: "/npcs" },
  { label: "Encounters",    value: encounters.data.value ?? "—", icon: IconNavEncounters, to: "/encounters" },
  { label: "Locations",     value: locations.data.value ?? "—",  icon: IconNavAtlas,      to: "/locations" },
]);
</script>
