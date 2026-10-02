<template>
  <div :class="variant === 'card' ? 'rounded-lg border border-border bg-card p-4 space-y-3' : 'space-y-2'">
    <component :is="variant === 'card' ? 'h2' : 'h3'" :class="headingClass">
      Library Art
    </component>
    <p class="text-caption text-muted-foreground italic">
      Publish your uploaded library art for everyone. Monster and spell art becomes canonical
      art (a spell without art of its own takes a same-named spell's); item art becomes a
      default by name. Other DMs will see your images for any library content they haven't
      personalised. Re-running is safe: it updates existing art with your latest images.
    </p>
    <div v-if="statsQuery.data.value" class="text-caption text-foreground">
      Currently published:
      <span class="font-semibold">{{ statsQuery.data.value.monsters }}</span> monsters ·
      <span class="font-semibold">{{ statsQuery.data.value.spells }}</span> spells ·
      <span class="font-semibold">{{ statsQuery.data.value.items }}</span> items
    </div>
    <div v-if="publishResult" class="text-caption" :class="successClass">
      Done: {{ publishResult.monsters }} monsters · {{ publishResult.spells }} spells ·
      {{ publishResult.items }} items published.
    </div>
    <AppButton
      variant="primary"
      size="sm"
      :icon="IconUpload"
      :loading="bulkPublish.isPending.value"
      :label="bulkPublish.isPending.value ? 'Publishing…' : 'Publish all my library art'"
      @click="handlePublishArt"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconUpload } from "@/lib/icons";
import {
  useBulkPublishLibraryArtDefaults,
  useLibraryArtDefaultStats,
  useSyncLibraryItemArt,
  useSyncLibrarySpellArt,
  type LibraryArtDefaultStats,
} from "@/composables/library/useLibraryArtDefaults";
import { useBulkMarkLibraryMonsterArtAsCanonical, useSyncLibraryMonsterArt } from "@/composables/library/useLibraryMonsterArt";
import { useBulkMarkLibrarySpellArtAsCanonical } from "@/composables/library/useLibrarySpellArt";

// "card" = standalone bordered card (AdminContentTab's admin panel context).
// "inline" = embedded section inside a parent panel that already has its own
// card chrome (AppInvitePanel's modal). The two source call sites also
// differ in success-message color (green-500 vs the elven-green token) —
// preserved verbatim per variant rather than unified, since unifying it
// wasn't asked for and would be a visible behavior change.
const { variant = "card" } = defineProps<{
  variant?: "card" | "inline";
}>();

const headingClass = computed(() =>
  variant === "card"
    ? "font-cinzel text-sm font-semibold tracking-wide text-foreground"
    : "text-label-lg font-semibold text-muted-foreground uppercase",
);
const successClass = computed(() => (variant === "card" ? "text-ink-success" : "text-elven-green"));

const statsQuery = useLibraryArtDefaultStats();
const bulkPublish = useBulkPublishLibraryArtDefaults();
const bulkMarkMonsters = useBulkMarkLibraryMonsterArtAsCanonical();
const bulkMarkSpells   = useBulkMarkLibrarySpellArtAsCanonical();
const syncArtToShared  = useSyncLibraryMonsterArt();
const syncSpellArt     = useSyncLibrarySpellArt();
const syncItemArt      = useSyncLibraryItemArt();
const publishResult = ref<LibraryArtDefaultStats | null>(null);

async function handlePublishArt() {
  publishResult.value = null;
  const [monsterCount, spellArtCount, itemResult] = await Promise.all([
    bulkMarkMonsters.mutateAsync(),
    bulkMarkSpells.mutateAsync(),
    bulkPublish.mutateAsync(),
  ]);
  // Sync canonical art into the shared library tables
  await Promise.all([
    syncArtToShared.mutateAsync(),
    syncSpellArt.mutateAsync(),
    syncItemArt.mutateAsync(),
  ]);
  publishResult.value = { monsters: monsterCount, spells: spellArtCount, items: itemResult.items };
  statsQuery.refetch();
}
</script>
