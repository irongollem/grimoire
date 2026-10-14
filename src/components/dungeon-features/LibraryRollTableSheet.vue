<template>
  <div>
    <div class="flex items-center justify-between gap-2 mb-4">
      <h2 class="text-heading font-bold text-foreground">{{ table?.name ?? "Roll Table" }}</h2>
      <AppButton variant="subtle" size="sm" label="Back" @click="emit('done')" />
    </div>

    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <p v-else-if="!table" class="text-body text-muted-foreground italic">This roll table could not be found.</p>
    <div v-else class="flex flex-col gap-4 max-w-2xl">
      <!-- Read-only library banner (same shape as MonsterDetail's) -->
      <LibraryReadOnlyBanner
        :source="table.source"
        message="Use it in your campaign to get your own editable copy."
        action-label="Use in campaign"
        busy-label="Copying…"
        :busy="using"
        :disabled="!activeCampaignId"
        disabled-reason="Pick a campaign first"
        @action="useInCampaign"
      />

      <p v-if="table.description" class="text-body text-muted-foreground italic">{{ table.description }}</p>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-heading-sm font-bold text-foreground">Entries ({{ table.entries.length }})</h3>
          <span class="text-label text-muted-foreground">{{ table.dice }}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <div
            v-for="entry in table.entries"
            :key="entry.min"
            class="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2"
          >
            <span class="shrink-0 text-label-lg font-bold text-primary/80 bg-primary/10 rounded px-2 py-0.5 min-w-12 text-center">
              {{ entry.min === entry.max ? entry.min : `${entry.min}–${entry.max}` }}
            </span>
            <div class="flex-1 min-w-0 flex flex-col gap-1">
              <span class="text-body text-foreground">{{ entry.label }}</span>
              <p v-if="entry.notes" class="text-caption text-muted-foreground italic">{{ entry.notes }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="table.tags.length" class="flex flex-wrap gap-1">
        <span
          v-for="tag in table.tags"
          :key="tag"
          class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
        >{{ tag }}</span>
      </div>

      <div v-if="table.notes" class="rounded-lg border border-border bg-card p-4">
        <RichTextViewer :content="table.notes" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A Grimoire-authored roll table, read only (#1060). Roll tables are copied on
 * use: "Use in campaign" inserts an own table in the active campaign and hands
 * it to the tab, which selects it, as creating one does.
 */
import { storeToRefs } from "pinia";
import { useLibraryRollTable, useCopyLibraryRollTableToCampaign } from "@/composables/dungeon-features/useRollTables";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import AppButton from "@/components/common/controls/AppButton.vue";
import LibraryReadOnlyBanner from "@/components/common/entity/LibraryReadOnlyBanner.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";

const { tableId } = defineProps<{ tableId: string }>();
const emit = defineEmits<{ done: []; used: [id: string] }>();

const toast = useToast();
const { activeCampaignId } = storeToRefs(useCampaignStore());
const { data: table, isLoading } = useLibraryRollTable(() => tableId);
const { mutateAsync: useIt, isPending: using } = useCopyLibraryRollTableToCampaign();

async function useInCampaign() {
  if (!table.value) return;
  try {
    const copy = await useIt(table.value);
    emit("used", copy.id);
  } catch (e: unknown) {
    toast.error(toast.fromError(e));
  }
}
</script>
