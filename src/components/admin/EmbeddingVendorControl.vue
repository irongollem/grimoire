<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Embedding Vendor</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Exactly one vendor may power semantic-search embedding (#595, #600) — the database enforces this with a
        unique index (<code class="font-mono text-2xs">provider_config_single_embedding_vendor</code>), so this is
        a single choice rather than a toggle per provider. Applying a change re-embeds every monster, NPC, faction,
        location and note automatically — there is nothing else to remember afterward.
      </p>
    </div>

    <div v-if="providersQuery.isPending.value" class="text-muted-foreground text-body">Loading…</div>
    <div v-else-if="providersQuery.isError.value" class="text-destructive text-body">Failed to load provider config.</div>
    <template v-else>
      <div class="flex flex-wrap items-end gap-3">
        <div class="space-y-1">
          <label class="block text-label text-muted-foreground">Vendor</label>
          <select
            v-model="selectedProvider"
            class="bg-background border border-border rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            :disabled="isBusy"
          >
            <option v-for="v in embeddingVendors" :key="v" :value="v">{{ PROVIDER_LABELS[v] ?? v }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="block text-label text-muted-foreground">Model</label>
          <select
            v-model="selectedModel"
            class="bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            :disabled="isBusy || !selectedProvider"
          >
            <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
        <button
          type="button"
          class="px-4 py-1.5 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          :disabled="!hasChanges || isBusy"
          @click="apply"
        >
          {{ configPhase === 'applying' ? 'Applying…' : 'Apply' }}
        </button>
      </div>

      <!-- Phase 1: the set_embedding_provider RPC itself. Distinct copy from
           the backfill's own error text below so a failure here is never
           mistaken for a backfill (phase 2) failure. -->
      <p v-if="configPhase === 'error' && configError" class="text-caption text-destructive">
        Config update failed: {{ configError }}
      </p>
      <p v-else-if="configPhase === 'applying'" class="flex items-center gap-2 text-caption text-muted-foreground">
        <Loader2Icon class="h-4 w-4 text-primary animate-spin shrink-0" />
        <span>Updating embedding provider configuration…</span>
      </p>
      <!-- Phase 2: the backfill this triggers immediately on success. Same
           status line MonsterEmbeddingBackfill.vue renders -- it's the same
           run, not a second copy. -->
      <EmbeddingBackfillStatus v-else />
    </template>
  </div>
</template>

<script setup lang="ts">
// Single-choice control for the active embedding vendor+model (#595 follow-up:
// "one click" requirement). Independent per-provider toggles made the DB's
// "at most one embedding vendor" invariant reachable-but-rejected client-side
// (see the multi-vendor warning banner in AdminProvidersTab.vue); presenting
// the choice as one control makes the invalid state unrepresentable in the UI
// instead of merely caught after the fact.
import { ref, computed, watch } from "vue";
import { Loader2Icon } from "@lucide/vue";
import { useAdminProviders, PROVIDER_LABELS } from "@/composables/useAdminProviders";
import { useConfirm } from "@/composables/useConfirm";
import { useEmbeddingBackfill } from "@/composables/useEmbeddingBackfill";
import EmbeddingBackfillStatus from "@/components/admin/EmbeddingBackfillStatus.vue";

interface Props {
  /** Vendor -> known embedding models. Owned by AdminProvidersTab.vue (it
   * also needs this list for the Model API Costs section), passed down
   * rather than redefined here so the two never drift apart. */
  knownEmbeddingModels: Record<string, string[]>;
}
const { knownEmbeddingModels } = defineProps<Props>();

const embeddingVendors = computed(() => Object.keys(knownEmbeddingModels));

const { query: providersQuery, setEmbeddingProvider } = useAdminProviders();
const { confirm } = useConfirm();
const backfill = useEmbeddingBackfill();

const savedProvider = computed<string | null>(
  () => providersQuery.data.value?.find((r) => r.embedding_enabled)?.provider ?? null,
);
const savedModel = computed<string | null>(
  () => providersQuery.data.value?.find((r) => r.embedding_enabled)?.embedding_model ?? null,
);

const selectedProvider = ref<string | null>(null);
const selectedModel = ref<string | null>(null);

// Seed the selection from the saved state exactly once, on first load --
// re-seeding on every refetch would clobber a selection the admin is
// actively composing (e.g. right after invalidation from their own apply).
const seeded = ref(false);
watch(
  () => providersQuery.data.value,
  (rows) => {
    if (seeded.value || !rows) return;
    const active = rows.find((r) => r.embedding_enabled);
    if (!active) return;
    selectedProvider.value = active.provider;
    selectedModel.value = active.embedding_model;
    seeded.value = true;
  },
  { immediate: true },
);

// Changing vendor invalidates the current model choice unless it happens to
// also be valid for the new vendor (it won't be -- the two vendors' models
// never overlap).
watch(selectedProvider, (provider) => {
  if (!provider) return;
  const models = knownEmbeddingModels[provider] ?? [];
  if (!selectedModel.value || !models.includes(selectedModel.value)) {
    selectedModel.value = models[0] ?? null;
  }
});

const modelOptions = computed(() => (selectedProvider.value ? knownEmbeddingModels[selectedProvider.value] ?? [] : []));

const hasChanges = computed(() => {
  if (!selectedProvider.value || !selectedModel.value) return false;
  return selectedProvider.value !== savedProvider.value || selectedModel.value !== savedModel.value;
});

const configPhase = ref<"idle" | "applying" | "error">("idle");
const configError = ref<string | null>(null);

const isBusy = computed(() => configPhase.value === "applying" || backfill.isRunning.value);

async function apply() {
  if (!hasChanges.value || !selectedProvider.value || !selectedModel.value || isBusy.value) return;

  // A model-only change (e.g. text-embedding-3-small -> -large) needs the
  // exact same confirm and re-embed as a vendor change: the resulting
  // vectors are just as incomparable to the old ones. No special-casing here
  // is deliberate, not an oversight.
  const ok = await confirm(
    `This sets the embedding provider to ${PROVIDER_LABELS[selectedProvider.value] ?? selectedProvider.value} ` +
      `(${selectedModel.value}) and re-embeds every monster, NPC, faction, location and note to match. Re-embedding ` +
      "takes a few minutes, and until it finishes, retrieval falls back to a smaller candidate list. Continue?",
    { title: "Change embedding provider", confirmLabel: "Apply & re-embed", danger: true },
  );
  if (!ok) return;

  configPhase.value = "applying";
  configError.value = null;
  try {
    await setEmbeddingProvider.mutateAsync({ provider: selectedProvider.value, model: selectedModel.value });
  } catch (err) {
    configError.value = err instanceof Error ? err.message : "Failed to update the embedding provider configuration.";
    configPhase.value = "error";
    return;
  }
  configPhase.value = "idle";

  // Phase 2: run the backfill to completion immediately. This is the SAME
  // loop (and the same in-flight run) as MonsterEmbeddingBackfill.vue's
  // standalone button -- see useEmbeddingBackfill.ts.
  await backfill.runBackfill();
}
</script>
