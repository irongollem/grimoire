<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <h2 class="text-heading-sm font-semibold text-foreground">
      Library Art
    </h2>
    <p class="text-caption text-muted-foreground italic">
      Monster and spell art you edit is already canonical, so it needs no publishing. This
      publishes item art as a default by name and syncs canonical art into the shared library
      (a spell without art of its own takes a same-named spell's). Re-running is safe.
    </p>
    <div v-if="statsQuery.data.value" class="text-caption text-foreground">
      Currently published:
      <span class="font-semibold">{{ statsQuery.data.value.monsters }}</span> monsters ·
      <span class="font-semibold">{{ statsQuery.data.value.spells }}</span> spells ·
      <span class="font-semibold">{{ statsQuery.data.value.items }}</span> items
    </div>
    <div v-if="publishResult" class="text-caption text-ink-success">
      Done: {{ publishResult.items }} items published; monster and spell art synced.
    </div>
    <AppButton
      variant="primary"
      size="sm"
      :icon="IconUpload"
      :loading="bulkPublish.isPending.value"
      :label="bulkPublish.isPending.value ? 'Publishing…' : 'Publish item art and sync'"
      @click="handlePublishArt"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconUpload } from "@/lib/icons";
import {
  useBulkPublishLibraryArtDefaults,
  useLibraryArtDefaultStats,
  useSyncLibraryItemArt,
  useSyncLibrarySpellArt,
} from "@/composables/library/useLibraryArtDefaults";
import { useSyncLibraryMonsterArt } from "@/composables/library/useLibraryMonsterArt";

const statsQuery = useLibraryArtDefaultStats();
const bulkPublish = useBulkPublishLibraryArtDefaults();
const syncArtToShared  = useSyncLibraryMonsterArt();
const syncSpellArt     = useSyncLibrarySpellArt();
const syncItemArt      = useSyncLibraryItemArt();
const publishResult = ref<{ items: number } | null>(null);

async function handlePublishArt() {
  publishResult.value = null;
  const itemResult = await bulkPublish.mutateAsync();
  // Sync canonical art into the shared library tables
  await Promise.all([
    syncArtToShared.mutateAsync(),
    syncSpellArt.mutateAsync(),
    syncItemArt.mutateAsync(),
  ]);
  publishResult.value = { items: itemResult.items };
  statsQuery.refetch();
}
</script>
