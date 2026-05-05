<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-md shadow-xl flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 class="font-cinzel text-lg font-bold text-foreground">Import Campaign Backup</h2>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="close"
          >
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <!-- Step 1: File picker -->
          <div v-if="!preview">
            <p class="font-fell text-sm text-muted-foreground italic mb-3">
              Select a <code class="font-mono text-xs bg-muted px-1 rounded">.grimoire-backup</code> file exported
              from Grimoire. World bundles (<code class="font-mono text-xs bg-muted px-1 rounded">.grimoire</code>)
              are not accepted here.
            </p>

            <label
              class="flex flex-col items-center gap-2 border-2 border-dashed border-border rounded-lg px-6 py-8 cursor-pointer hover:border-primary/50 transition-colors"
              :class="{ 'opacity-50 cursor-not-allowed': isPending }"
            >
              <Upload class="h-8 w-8 text-muted-foreground" />
              <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
                Click to select backup file
              </span>
              <span class="font-fell text-xs text-muted-foreground italic">
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

            <p v-if="parseError" class="mt-3 font-fell text-xs text-destructive">
              {{ parseError }}
            </p>
          </div>

          <!-- Step 2: Preview & confirm -->
          <template v-else>
            <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
              <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Original campaign
              </p>
              <p class="font-cinzel text-sm font-bold text-foreground">{{ preview.campaignName }}</p>
              <p class="font-fell text-xs text-muted-foreground italic">
                Exported {{ formattedDate }}
              </p>
            </div>

            <!-- Entity counts -->
            <div class="space-y-1">
              <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Contents
              </p>
              <div class="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <template v-for="(count, key) in nonZeroCounts" :key="key">
                  <span class="font-fell text-xs text-muted-foreground capitalize">
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
              <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
                IMPORT AS
              </label>
              <input
                v-model="newName"
                type="text"
                required
                class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Campaign name…"
              />
            </div>

            <!-- Warning note -->
            <div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <p class="font-fell text-xs text-amber-700 dark:text-amber-400">
                References to your monster, item, and spell library are preserved by ID.
                If a referenced entity doesn't exist in your account, those links will appear broken
                until you restore the library entry.
              </p>
            </div>

            <p v-if="importError" class="font-fell text-xs text-destructive">{{ importError }}</p>
          </template>
        </div>

        <!-- Footer actions -->
        <div class="shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            v-if="preview"
            type="button"
            class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            :disabled="isPending"
            @click="resetPreview"
          >
            Back
          </button>
          <button
            type="button"
            class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            :disabled="isPending"
            @click="close"
          >
            Cancel
          </button>
          <button
            v-if="preview"
            type="button"
            :disabled="isPending || !newName.trim()"
            class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="doImport"
          >
            {{ isPending ? "Importing…" : "Import Campaign" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { Upload } from "lucide-vue-next";
import { useCampaignStore } from "@/stores/campaign";
import { useImportCampaign } from "@/composables/useCampaignBackup";
import type { BackupPreview } from "@/composables/useCampaignBackup";

const { modelValue } = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const router = useRouter();
const campaignStore = useCampaignStore();
const { parseFile, executeImport, parseError, isPending, backup, reset } = useImportCampaign();

const preview = ref<BackupPreview | null>(null);
const newName = ref("");
const importError = ref<string | null>(null);

watch(() => modelValue, (open) => {
  if (!open) {
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

function formatKey(key: string): string {
  return key.replace(/_/g, " ");
}

function close() {
  if (!isPending.value) emit("update:modelValue", false);
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
    emit("update:modelValue", false);
    router.push("/");
  } catch (err) {
    importError.value = err instanceof Error ? err.message : "Import failed. Please try again.";
  }
}
</script>
