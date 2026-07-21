<template>
  <div class="max-w-lg space-y-8">
    <!-- Export -->
    <section class="space-y-3">
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Export Campaign</h3>
        <p class="font-fell text-sm text-muted-foreground italic mt-1">
          Downloads a <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">.grimoire-backup</code> file
          containing all campaign data — party, NPCs, locations, quests, encounters, notes, and more.
        </p>
      </div>

      <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-1.5">
        <p class="text-eyebrow font-semibold text-muted-foreground">Included</p>
        <ul class="font-fell text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Party members, character classes &amp; spells</li>
          <li>NPCs, factions, locations, quests, encounters</li>
          <li>Notes, calendar events, party inventory</li>
          <li>Crafting recipes, roll tables, loot tables</li>
          <li>Session scheduling, puzzle rooms, sounds</li>
        </ul>
        <p class="text-eyebrow font-semibold text-muted-foreground mt-2">Not included</p>
        <ul class="font-fell text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>API keys &amp; Spotify credentials (security)</li>
          <li>Campaign members &amp; invite links (fresh start)</li>
          <li>Chat history &amp; active combat state</li>
          <li>Your monster/item/spell library (account-scoped)</li>
        </ul>
      </div>

      <button
        :disabled="isExporting"
        class="flex items-center gap-2 px-4 py-2 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        @click="doExport"
      >
        <IconDownload class="h-3.5 w-3.5" />
        {{ isExporting ? "Exporting…" : "Export Campaign" }}
      </button>

      <p v-if="exportError" class="font-fell text-xs text-destructive">{{ exportError }}</p>
    </section>

    <div class="border-t border-border" />

    <!-- Info about import -->
    <section class="space-y-2">
      <h3 class="font-cinzel text-sm font-semibold text-foreground">Import a Campaign</h3>
      <p class="font-fell text-sm text-muted-foreground italic">
        To import a <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">.grimoire-backup</code> file,
        use the <strong>Import from backup</strong> option in the campaign switcher (top of the left sidebar).
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconDownload } from '@/lib/icons';
import { useCampaignStore } from "@/stores/campaign";
import { useExportCampaign } from "@/composables/useCampaignBackup";

const campaignStore = useCampaignStore();
const { mutateAsync: runExport, isPending: isExporting } = useExportCampaign();
const exportError = ref<string | null>(null);

async function doExport() {
  const id = campaignStore.activeCampaignId;
  if (!id) return;
  exportError.value = null;
  try {
    await runExport(id);
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : "Export failed";
  }
}
</script>
