<template>
  <div class="space-y-6">
    <!-- SRD Art Repair -->
    <SrdArtRepairPanel />
    <SrdArtRepairPanel mode="spell" />

    <!-- SRD Art Defaults -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-3">
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">SRD Art Defaults</h2>
      <p class="font-fell text-xs text-muted-foreground italic">
        Publish your uploaded SRD art as community defaults. Other DMs will see your images
        for any SRD content they haven't personalised. Re-running is safe — it updates
        existing defaults with your latest images.
      </p>
      <div v-if="statsQuery.data.value" class="font-fell text-xs text-foreground">
        Currently published:
        <span class="font-semibold">{{ statsQuery.data.value.monsters }}</span> monsters ·
        <span class="font-semibold">{{ statsQuery.data.value.spells }}</span> spells ·
        <span class="font-semibold">{{ statsQuery.data.value.items }}</span> items
      </div>
      <div v-if="publishResult" class="font-fell text-xs text-green-500">
        Done — {{ publishResult.monsters }} monsters · {{ publishResult.spells }} spells ·
        {{ publishResult.items }} items published.
      </div>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50"
        :disabled="bulkPublish.isPending.value"
        @click="handlePublishArt"
      >
        <IconUpload class="h-3.5 w-3.5" />
        {{ bulkPublish.isPending.value ? 'Publishing…' : 'Publish all my SRD art' }}
      </button>
    </div>

    <!-- Placeholder Art Focal Points -->
    <div class="rounded-lg border border-border bg-card p-4 space-y-4">
      <div>
        <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Placeholder Art</h2>
        <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
          Click anywhere on a placeholder image to set where the focus point should be. This corrects
          cases where smartcrop picks the wrong area (e.g. torso instead of face).
          Changes take effect immediately for users whose smartcrop cache hasn't run yet,
          and on next page load for those who have.
        </p>
      </div>

      <div v-if="placeholderFpQuery.isPending.value" class="text-muted-foreground font-fell text-sm">
        Loading…
      </div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div
          v-for="entity in PLACEHOLDER_ENTITIES"
          :key="entity.type"
          class="flex flex-col gap-1.5"
        >
          <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
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
            class="font-cinzel text-[9px] text-muted-foreground/60 tracking-wider text-center"
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
import { IconCheck, IconUpload } from "@/lib/icons";
import SrdArtRepairPanel from "@/components/admin/SrdArtRepairPanel.vue";
import { useBulkPublishSrdArtDefaults, useSrdArtDefaultStats, useSyncSrdSpellArtToSharedTable } from "@/composables/useSrdArtDefaults";
import type { SrdArtDefaultStats } from "@/composables/useSrdArtDefaults";
import { useBulkMarkSrdMonsterArtAsCanonical, useSyncSrdArtToSharedTable } from "@/composables/useSrdMonsterArt";
import { useBulkMarkSrdSpellArtAsCanonical } from "@/composables/useSrdSpellArt";
import { useAdminPlaceholderFocalPoints } from "@/composables/useAdminPlaceholderFocalPoints";

const statsQuery = useSrdArtDefaultStats();
const bulkPublish = useBulkPublishSrdArtDefaults();
const bulkMarkMonsters = useBulkMarkSrdMonsterArtAsCanonical();
const bulkMarkSpells   = useBulkMarkSrdSpellArtAsCanonical();
const syncArtToShared  = useSyncSrdArtToSharedTable();
const syncSpellArt     = useSyncSrdSpellArtToSharedTable();
const publishResult = ref<SrdArtDefaultStats | null>(null);

async function handlePublishArt() {
  publishResult.value = null;
  const [monsterCount, spellArtCount, contentResult] = await Promise.all([
    bulkMarkMonsters.mutateAsync(),
    bulkMarkSpells.mutateAsync(),
    bulkPublish.mutateAsync(),
  ]);
  await Promise.all([
    syncArtToShared.mutateAsync(),
    syncSpellArt.mutateAsync(),
  ]);
  publishResult.value = { monsters: monsterCount, spells: contentResult.spells + spellArtCount, items: contentResult.items };
  statsQuery.refetch();
}

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
