<template>
  <div class="max-w-lg space-y-8">
    <!-- Export -->
    <section class="space-y-3">
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Export Campaign</h3>
        <p class="text-body text-muted-foreground italic mt-1">
          Downloads a <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">.grimoire-backup</code> file
          containing all campaign data: party, NPCs, locations, quests, encounters, notes, and more.
        </p>
      </div>

      <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-1.5">
        <p class="text-eyebrow font-semibold text-muted-foreground">Included</p>
        <ul class="text-caption text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Party members, character classes &amp; spells</li>
          <li>NPCs, factions, locations, quests, encounters</li>
          <li>Notes, calendar events, party inventory</li>
          <li>Crafting recipes, roll tables, loot tables</li>
          <li>Session scheduling, puzzle rooms, sounds</li>
        </ul>
        <p class="text-eyebrow font-semibold text-muted-foreground mt-2">Not included</p>
        <ul class="text-caption text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>API keys &amp; Spotify credentials (security)</li>
          <li>Campaign members &amp; invite links (fresh start)</li>
          <li>Chat history &amp; active combat state</li>
          <li>Your monster/item/spell library (account-scoped)</li>
        </ul>
      </div>

      <AppButton
        variant="primary"
        size="md"
        :icon="IconDownload"
        :loading="isExporting"
        :label="isExporting ? 'Exporting…' : 'Export Campaign'"
        @click="doExport"
      />

      <p v-if="exportError" class="text-caption text-destructive">{{ exportError }}</p>
    </section>

    <div class="border-t border-border" />

    <!-- Markdown export -->
    <section class="space-y-3">
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Export as Markdown</h3>
        <p class="text-body text-muted-foreground italic mt-1">
          Downloads a <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">.zip</code> of readable
          <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">.md</code> files, one per party member, NPC,
          location, faction, quest and note, linked to each other so they open in Obsidian or any Markdown editor.
          It is for reading and taking your data elsewhere, and cannot be restored; use the
          <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">.grimoire-backup</code> above for that.
        </p>
      </div>

      <AppButton
        variant="outline"
        size="md"
        :icon="IconDownload"
        :loading="isExportingMarkdown"
        :label="isExportingMarkdown ? 'Exporting…' : 'Export as Markdown'"
        @click="doMarkdownExport"
      />

      <p v-if="markdownExportError" class="text-caption text-destructive">{{ markdownExportError }}</p>
    </section>

    <div class="border-t border-border" />

    <!-- Info about import -->
    <section class="space-y-2">
      <h3 class="font-cinzel text-sm font-semibold text-foreground">Import a Campaign</h3>
      <p class="text-body text-muted-foreground italic">
        To import a <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">.grimoire-backup</code> file,
        use the <strong>Import from backup</strong> option in the campaign switcher (top of the left sidebar).
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconDownload } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useExportCampaign } from "@/composables/campaign/useCampaignBackup";
import { useExportCampaignMarkdown } from "@/composables/campaign/useCampaignMarkdownExport";

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

const { mutateAsync: runMarkdownExport, isPending: isExportingMarkdown } = useExportCampaignMarkdown();
const markdownExportError = ref<string | null>(null);

async function doMarkdownExport() {
  const id = campaignStore.activeCampaignId;
  if (!id) return;
  markdownExportError.value = null;
  try {
    await runMarkdownExport(id);
  } catch (err) {
    markdownExportError.value = err instanceof Error ? err.message : "Export failed";
  }
}
</script>
