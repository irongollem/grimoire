<template>
  <section v-if="match || ownTable" class="flex flex-col gap-1 border border-border bg-card p-3" aria-label="Habitat" data-testid="place-habitat">
    <template v-if="match">
      <span class="text-eyebrow text-muted-foreground">Lies in</span>
      <p class="text-body leading-snug text-foreground">
        {{ match.name }}<template v-if="match.through"><span class="text-muted-foreground">, through {{ match.through }}</span></template>
      </p>
      <p v-if="match.summary" class="text-caption text-muted-foreground" data-testid="place-habitat-life">{{ match.summary }}</p>
    </template>
    <p v-if="ownTable" class="text-caption text-muted-foreground" data-testid="place-habitat-table">
      Its own table, {{ ownTable }}, comes first
    </p>
    <RouterLink v-if="match" :to="{ path: '/canon', query: { section: 'life' } }" class="text-label text-muted-foreground underline-offset-2 hover:underline">
      Who and what lives here
    </RouterLink>
  </section>
</template>

<script setup lang="ts">
/**
 * The habitat a place lies in and what lives there (#1255 item 31), for the DM on the place's page: its own habitat, or
 * the nearest covered place it lies inside ("through"). DM pages only: a player surface never mounts it, and the
 * habitat tables are DM-only reads. When the place (or one it lies inside) has an encounter table of its own, that
 * table comes first and the line says so beside the habitat (`encounterSourceForPlace`). Nothing renders when the
 * place is in no habitat and has no table.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { usePlacedTables } from "@/composables/canon/usePlacedTables";
import { useAllLocations } from "@/composables/locations/useLocations";
import { encounterSourceForPlace, habitatForPlace } from "@/lib/canon/habitats";
import { sharesLine } from "@edge-shared/worldBlock.ts";

const { placeId } = defineProps<{ placeId: string }>();

const { data: locations } = useAllLocations();
const { habitats, places, life } = useCampaignHabitats();

const placedTables = usePlacedTables();
const ownTable = computed(() => {
  const parents = new Map((locations.value ?? []).map((l) => [l.id, l.parent_id]));
  const source = encounterSourceForPlace(placeId, (id) => parents.get(id) ?? null, placedTables.value, places.value);
  return source?.from === "table" ? source.tables.map((t) => t.name).join(", ") : null;
});

const match = computed<{ name: string; through: string | null; summary: string } | null>(() => {
  const all = locations.value ?? [];
  const parents = new Map(all.map((l) => [l.id, l.parent_id]));
  const found = habitatForPlace(placeId, (id) => parents.get(id) ?? null, places.value);
  if (found === null) return null;
  const habitat = habitats.value.find((h) => h.id === found.habitatId);
  if (habitat === undefined) return null;
  const through = found.throughPlaceId === placeId ? null : (all.find((l) => l.id === found.throughPlaceId)?.name ?? null);
  return { name: habitat.name, through, summary: sharesLine(life.value.filter((l) => l.habitatId === habitat.id), "anything else") };
});
</script>
