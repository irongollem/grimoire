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
          <h2 class="font-cinzel text-lg font-bold text-foreground">Import World Bundle</h2>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="close"
          >
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          <!-- Step 1: file picker -->
          <div v-if="!preview">
            <p class="font-fell text-sm text-muted-foreground italic mb-3">
              Select a <code class="font-mono text-xs bg-muted px-1 rounded">.grimoire</code> bundle, or a
              <code class="font-mono text-xs bg-muted px-1 rounded">.pdf</code> exported from Grimoire with
              campaign data embedded. Campaign backups
              (<code class="font-mono text-xs bg-muted px-1 rounded">.grimoire-backup</code>) are not accepted here.
            </p>

            <label
              class="flex flex-col items-center gap-2 border-2 border-dashed border-border rounded-lg px-6 py-8 cursor-pointer hover:border-primary/50 transition-colors"
              :class="{ 'opacity-50 cursor-not-allowed': isPending }"
            >
              <IconUpload class="h-8 w-8 text-muted-foreground" />
              <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
                Click to select a bundle or PDF
              </span>
              <span class="font-fell text-xs text-muted-foreground italic">.grimoire or .pdf</span>
              <input
                type="file"
                accept=".grimoire,.pdf,application/pdf"
                class="sr-only"
                :disabled="isPending"
                @change="onFileChange"
              />
            </label>

            <p v-if="parseError" class="mt-3 font-fell text-xs text-destructive">{{ parseError }}</p>
          </div>

          <!-- Step 2: preview & configure -->
          <template v-else>
            <!-- Bundle info -->
            <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-1">
              <p class="text-eyebrow font-semibold text-muted-foreground">Bundle</p>
              <p class="font-cinzel text-sm font-bold text-foreground">{{ preview.name }}</p>
              <p v-if="preview.description" class="font-fell text-xs text-muted-foreground">
                {{ preview.description }}
              </p>
              <p class="font-fell text-xs text-muted-foreground italic">Exported {{ formattedDate }}</p>
            </div>

            <!-- Import mode -->
            <div class="space-y-2">
              <p class="text-eyebrow font-semibold text-muted-foreground">
                Import into
              </p>
              <div class="space-y-2">
                <label class="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    v-model="importMode"
                    type="radio"
                    value="merge"
                    class="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
                  />
                  <div>
                    <span class="font-fell text-sm text-foreground group-hover:text-primary transition-colors">
                      Current campaign
                    </span>
                    <p class="font-fell text-xs text-muted-foreground italic">
                      Merge entities into <strong>{{ campaignStore.activeCampaign?.name }}</strong>.
                      Nothing is overwritten.
                    </p>
                  </div>
                </label>
                <label class="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    v-model="importMode"
                    type="radio"
                    value="new-campaign"
                    class="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-ring"
                  />
                  <div>
                    <span class="font-fell text-sm text-foreground group-hover:text-primary transition-colors">
                      New campaign
                    </span>
                    <p class="font-fell text-xs text-muted-foreground italic">
                      Create a fresh campaign seeded with this bundle's content.
                    </p>
                  </div>
                </label>
              </div>

              <!-- New campaign name -->
              <div v-if="importMode === 'new-campaign'" class="pt-1">
                <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">
                  Campaign Name
                </label>
                <input
                  v-model="newCampaignName"
                  type="text"
                  :placeholder="preview.name || 'Campaign name…'"
                  class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <!-- Entity type toggles -->
            <div class="space-y-2">
              <p class="text-eyebrow font-semibold text-muted-foreground">
                Include
              </p>
              <div class="space-y-1.5">
                <label
                  v-for="type in availableTypes"
                  :key="type.key"
                  class="flex items-center justify-between gap-2 cursor-pointer group"
                >
                  <div class="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      :checked="selectedTypes.has(type.key)"
                      class="h-3.5 w-3.5 rounded border-border text-primary focus:ring-ring"
                      @change="toggleType(type.key)"
                    />
                    <span class="font-fell text-sm text-foreground group-hover:text-primary transition-colors">
                      {{ type.label }}
                    </span>
                  </div>
                  <span class="font-cinzel text-xs font-semibold text-muted-foreground shrink-0">
                    {{ preview.entityCounts[type.key] ?? 0 }}
                  </span>
                </label>
              </div>
            </div>

            <!-- Warning -->
            <div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 space-y-1">
              <p class="font-fell text-xs text-amber-700 dark:text-amber-400">
                Entities are added with fresh IDs — duplicates may appear if imported before.
                Player visibility flags are cleared; party-member links are reset.
              </p>
              <p class="font-fell text-xs text-amber-700 dark:text-amber-400">
                Monster, item, and spell references from your library are preserved by original ID.
              </p>
            </div>

            <p v-if="importError" class="font-fell text-xs text-destructive">{{ importError }}</p>
          </template>
        </div>

        <!-- Footer -->
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
            :disabled="isPending || selectedTypes.size === 0 || !importReady"
            class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="doImport"
          >
            {{ isPending ? "Importing…" : "Import Bundle" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, shallowRef } from "vue";
import { useRouter } from "vue-router";
import { IconUpload } from '@/lib/icons';
import { useCampaignStore } from "@/stores/campaign";
import { useImportWorldBundle, BUNDLE_ENTITY_TYPES } from "@/composables/useWorldBundle";
import type { BundleEntityKey, BundlePreview } from "@/composables/useWorldBundle";
import { pendingBundleFile } from "@/composables/usePendingBundle";

const open = defineModel<boolean>({ required: true });

const router = useRouter();
const campaignStore = useCampaignStore();
const { parseAnyFile, executeImport, parseError, isPending, bundle, reset } = useImportWorldBundle();

const preview = ref<BundlePreview | null>(null);
const selectedTypes = shallowRef<Set<BundleEntityKey>>(new Set());
const importMode = ref<"merge" | "new-campaign">("merge");
const newCampaignName = ref("");
const importError = ref<string | null>(null);

watch(open, async (isOpen) => {
  if (!isOpen) {
    preview.value = null;
    selectedTypes.value = new Set();
    importMode.value = "merge";
    newCampaignName.value = "";
    importError.value = null;
    pendingBundleFile.value = null;
    reset();
    return;
  }
  // Auto-load when opened via OS file association
  if (pendingBundleFile.value) {
    await loadFile(pendingBundleFile.value);
  }
});

const formattedDate = computed(() =>
  preview.value ? new Date(preview.value.exportedAt).toLocaleString() : "",
);

const availableTypes = computed(() =>
  BUNDLE_ENTITY_TYPES.filter((t) => (preview.value?.entityCounts[t.key] ?? 0) > 0),
);

const importReady = computed(() => {
  if (importMode.value === "new-campaign") return newCampaignName.value.trim().length > 0;
  return !!campaignStore.activeCampaignId;
});

function toggleType(key: BundleEntityKey) {
  const next = new Set(selectedTypes.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selectedTypes.value = next;
}

function close() {
  if (!isPending.value) open.value = false;
}

function resetPreview() {
  preview.value = null;
  selectedTypes.value = new Set();
  importMode.value = "merge";
  newCampaignName.value = "";
  importError.value = null;
}

async function loadFile(file: File) {
  await parseAnyFile(file);
  if (bundle.value) {
    preview.value = {
      name: bundle.value.name,
      description: bundle.value.description,
      exportedAt: bundle.value.exported_at,
      entityCounts: bundle.value._meta.entity_counts,
    };
    newCampaignName.value = bundle.value.name;
    selectedTypes.value = new Set(
      BUNDLE_ENTITY_TYPES
        .filter((t) => (bundle.value!._meta.entity_counts[t.key] ?? 0) > 0)
        .map((t) => t.key),
    );
  }
}

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await loadFile(file);
}

async function doImport() {
  importError.value = null;
  try {
    const result = await executeImport({
      campaignId: importMode.value === "merge" ? (campaignStore.activeCampaignId ?? null) : null,
      newCampaignName: importMode.value === "new-campaign" ? newCampaignName.value.trim() : undefined,
      includeTypes: new Set(selectedTypes.value),
    });

    open.value = false;

    if (result.newCampaign) {
      campaignStore.switchToCampaign(result.newCampaign);
      router.push("/");
    } else if (selectedTypes.value.has("npcs")) {
      router.push("/npcs");
    } else if (selectedTypes.value.has("locations")) {
      router.push("/locations");
    }
  } catch (err) {
    importError.value = err instanceof Error ? err.message : "Import failed. Please try again.";
  }
}
</script>
