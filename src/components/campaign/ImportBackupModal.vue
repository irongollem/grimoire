<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 class="text-heading font-bold text-foreground">Import Campaign Backup</h2>
          <AppButton
            variant="ghost"
            size="icon-xs"
            icon-size="md"
            :icon="IconClose"
            aria-label="Close"
            @click="close"
          />
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <!-- Step 1: File picker -->
          <div v-if="!preview">
            <p class="text-body text-muted-foreground italic mb-3">
              Select a <code class="font-mono text-xs bg-muted px-1 rounded">.grimoire-backup</code> file exported
              from Grimoire. World bundles (<code class="font-mono text-xs bg-muted px-1 rounded">.grimoire</code>)
              are not accepted here.
            </p>

            <label
              class="flex flex-col items-center gap-2 border-2 border-dashed border-border rounded-lg px-6 py-8 cursor-pointer hover:border-primary/50 transition-colors"
              :class="{ 'opacity-50 cursor-not-allowed': isPending }"
            >
              <IconUpload class="h-8 w-8 text-muted-foreground" />
              <span class="text-label-lg font-semibold text-muted-foreground">
                Click to select backup file
              </span>
              <span class="text-caption text-muted-foreground italic">
                .grimoire-backup files only
              </span>
              <input
                type="file"
                accept=".grimoire-backup"
                class="sr-only"
                :disabled="isPending"
                @change="onFileChange"
              />
            </label>

            <p v-if="parseError" class="mt-3 text-caption text-destructive">
              {{ parseError }}
            </p>
          </div>

          <!-- Step 2: Preview & confirm -->
          <template v-else>
            <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
              <p class="text-eyebrow font-semibold text-muted-foreground">
                Original campaign
              </p>
              <p class="font-cinzel text-sm font-bold text-foreground">{{ preview.campaignName }}</p>
              <p class="text-caption text-muted-foreground italic">
                Exported {{ formattedDate }}
              </p>
            </div>

            <!-- Entity counts -->
            <div class="space-y-1">
              <p class="text-eyebrow font-semibold text-muted-foreground">
                Contents
              </p>
              <div class="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <template v-for="(count, key) in nonZeroCounts" :key="key">
                  <span class="text-caption text-muted-foreground capitalize">
                    {{ formatKey(key) }}
                  </span>
                  <span class="font-cinzel text-xs font-semibold text-foreground text-right">
                    {{ count }}
                  </span>
                </template>
              </div>
            </div>

            <!-- New name -->
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-1">
                IMPORT AS
              </label>
              <AppInput
                v-model="newName"
                type="text"
                required
                tone="filled"
                size="body"
                placeholder="Campaign name…"
              />
            </div>

            <!-- Warning note -->
            <div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <p class="text-caption text-amber-700 dark:text-amber-400">
                References to your monster, item, and spell library are preserved by ID.
                If a referenced entity doesn't exist in your account, those links will appear broken
                until you restore the library entry.
              </p>
            </div>

            <p v-if="importError" class="text-caption text-destructive">{{ importError }}</p>
          </template>
        </div>

        <!-- Footer actions -->
        <div class="shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-border">
          <AppButton
            v-if="preview"
            variant="subtle"
            size="md"
            label="Back"
            :disabled="isPending"
            @click="resetPreview"
          />
          <AppButton
            variant="subtle"
            size="md"
            label="Cancel"
            :disabled="isPending"
            @click="close"
          />
          <AppButton
            v-if="preview"
            variant="primary"
            size="md"
            :disabled="isPending || !newName.trim()"
            :label="isPending ? 'Importing…' : 'Import Campaign'"
            @click="doImport"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { IconUpload, IconClose } from '@/lib/icons';
import { useCampaignStore } from "@/stores/campaign";
import { useImportCampaign } from "@/composables/useCampaignBackup";
import type { BackupPreview } from "@/composables/useCampaignBackup";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";

const open = defineModel<boolean>({ required: true });

const router = useRouter();
const campaignStore = useCampaignStore();
const { parseFile, executeImport, parseError, isPending, backup, reset } = useImportCampaign();

const preview = ref<BackupPreview | null>(null);
const newName = ref("");
const importError = ref<string | null>(null);

watch(open, (isOpen) => {
  if (!isOpen) {
    preview.value = null;
    newName.value = "";
    importError.value = null;
    reset();
  }
});

const formattedDate = computed(() => {
  if (!preview.value) return "";
  return new Date(preview.value.exportedAt).toLocaleString();
});

const nonZeroCounts = computed(() => {
  if (!preview.value) return {};
  return Object.fromEntries(
    Object.entries(preview.value.entityCounts).filter(([, v]) => v > 0),
  );
});

function formatKey(key: string | number): string {
  return String(key).replace(/_/g, " ");
}

function close() {
  if (!isPending.value) open.value = false;
}

function resetPreview() {
  preview.value = null;
  newName.value = "";
  importError.value = null;
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await parseFile(file);
  if (backup.value) {
    preview.value = {
      campaignName: backup.value.campaign.name as string,
      exportedAt: backup.value.exported_at,
      entityCounts: backup.value._meta.entity_counts,
    };
    newName.value = backup.value.campaign.name as string;
  }
}

async function doImport() {
  importError.value = null;
  try {
    const created = await executeImport(newName.value.trim());
    campaignStore.switchToCampaign(created);
    open.value = false;
    router.push("/");
  } catch (err) {
    importError.value = err instanceof Error ? err.message : "Import failed. Please try again.";
  }
}
</script>
