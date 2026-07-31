<template>
  <div class="space-y-6">
    <!-- SRD Art Repair -->
    <LibraryArtRepairPanel />
    <LibraryArtRepairPanel mode="spell" />

    <!-- SRD Art Defaults -->
    <LibraryArtPublishPanel />

    <!-- Placeholder Art Focal Points -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Placeholder Art</h2>
        <p class="text-caption text-muted-foreground italic mt-0.5">
          Click anywhere on a placeholder image to set where the focus point should be. This corrects
          cases where smartcrop picks the wrong area (e.g. torso instead of face).
          Changes take effect immediately for users whose smartcrop cache hasn't run yet,
          and on next page load for those who have.
        </p>
      </div>

      <div v-if="placeholderFpQuery.isPending.value" class="text-muted-foreground text-body">
        Loading…
      </div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div
          v-for="entity in PLACEHOLDER_ENTITIES"
          :key="entity.type"
          class="flex flex-col gap-1.5"
        >
          <p class="text-eyebrow font-semibold text-muted-foreground">
            {{ entity.label }}
          </p>

          <!-- Clickable image with crosshair overlay -->
          <div
            class="relative rounded-md overflow-hidden border border-border cursor-crosshair bg-muted"
            :class="entity.aspect"
            @click="handlePlaceholderFpClick($event, entity.type)"
          >
            <img
              :src="`/assets/placeholders/${entity.type}.webp`"
              :alt="entity.label"
              class="w-full h-full object-cover"
            />
            <!-- Current focal point crosshair -->
            <div
              v-if="placeholderFocalPoints[entity.type]"
              class="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              :style="{
                left: `${placeholderFocalPoints[entity.type].x}%`,
                top: `${placeholderFocalPoints[entity.type].y}%`,
              }"
            >
              <div class="absolute inset-0 rounded-full bg-primary/80 border-2 border-white shadow" />
            </div>
            <!-- Saved flash -->
            <div
              v-if="placeholderFpSaved === entity.type"
              class="absolute inset-0 flex items-center justify-center bg-black/40"
            >
              <IconCheck class="h-6 w-6 text-white" />
            </div>
          </div>

          <!-- Coordinates -->
          <p
            v-if="placeholderFocalPoints[entity.type]"
            class="text-label text-muted-foreground/60 text-center"
          >
            {{ placeholderFocalPoints[entity.type].x }}%, {{ placeholderFocalPoints[entity.type].y }}%
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconCheck } from "@/lib/icons";
import LibraryArtRepairPanel from "@/components/admin/LibraryArtRepairPanel.vue";
import LibraryArtPublishPanel from "@/components/admin/LibraryArtPublishPanel.vue";
import { useAdminPlaceholderFocalPoints } from "@/composables/useAdminPlaceholderFocalPoints";

const PLACEHOLDER_ENTITIES = [
  { type: "background",     label: "Background",      aspect: "aspect-3/4" },
  { type: "character",      label: "Character",       aspect: "aspect-3/4" },
  { type: "companion",      label: "Companion",       aspect: "aspect-3/4" },
  { type: "deity",          label: "Deity",           aspect: "aspect-3/4" },
  { type: "dungeonfeature", label: "Dungeon Feature", aspect: "aspect-square" },
  { type: "enigma",         label: "Puzzle (Enigma)", aspect: "aspect-square" },
  { type: "faction",        label: "Faction",         aspect: "aspect-square" },
  { type: "item",           label: "Item",            aspect: "aspect-3/4" },
  { type: "location",       label: "Location",        aspect: "aspect-3/4" },
  { type: "monster",        label: "Monster",         aspect: "aspect-3/4" },
  { type: "npc",            label: "NPC",             aspect: "aspect-3/4" },
  { type: "species",        label: "Species",         aspect: "aspect-square" },
  { type: "spell",          label: "Spell",           aspect: "aspect-3/4" },
  { type: "trap",           label: "Trap",            aspect: "aspect-square" },
] as const;

const { query: placeholderFpQuery, mutation: placeholderFpMutation } = useAdminPlaceholderFocalPoints();
const placeholderFocalPoints = computed(() => placeholderFpQuery.data.value ?? {});
const placeholderFpSaved = ref<string | null>(null);

function handlePlaceholderFpClick(event: MouseEvent, entityType: string) {
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
  placeholderFpMutation.mutate(
    { entityType, fp: { x, y } },
    {
      onSuccess: () => {
        placeholderFpSaved.value = entityType;
        setTimeout(() => { placeholderFpSaved.value = null; }, 1200);
      },
    },
  );
}
</script>
