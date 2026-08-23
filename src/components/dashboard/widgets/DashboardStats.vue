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
      <span class="ml-auto font-cinzel text-sm font-bold text-foreground">{{ stat.value }}</span>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconNavAtlas, IconNavEncounters, IconNavNpcs, IconNavQuests } from "@/lib/icons";
import { useAllQuests } from "@/composables/useQuests";
import { useNpcs } from "@/composables/useNpcs";
import { useEncounters } from "@/composables/useEncounters";
import { useAllLocations } from "@/composables/useLocations";

/** Counts, not a card: the strip is a set of links that happen to carry a
 *  number, so it deliberately skips DashboardWidget's chrome. */
const { data: allQuests } = useAllQuests();
const { data: npcs } = useNpcs();
const { data: encounters } = useEncounters();
const { data: locations } = useAllLocations();

const stats = computed(() => [
  { label: "Active Quests", value: (allQuests.value ?? []).filter((q) => q.status === "active").length || "—", icon: IconNavQuests, to: "/quests" },
  { label: "NPCs",          value: npcs.value?.length ?? "—",       icon: IconNavNpcs,       to: "/npcs" },
  { label: "Encounters",    value: encounters.value?.length ?? "—", icon: IconNavEncounters, to: "/encounters" },
  { label: "Locations",     value: locations.value?.length ?? "—",  icon: IconNavAtlas,      to: "/locations" },
]);
</script>
