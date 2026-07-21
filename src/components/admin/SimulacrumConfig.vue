<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Simulacrum</h2>
      <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
        Feature flag for the portrait → 3D mini pipeline. "Teaser" ships the entry point + demand
        gate before the Meshy subscription exists; "Live" is the real pipeline (requires the Meshy
        platform key).
      </p>
    </div>

    <p v-if="query.isPending.value" class="font-fell text-sm text-muted-foreground">Loading…</p>

    <template v-else>
      <!-- Meshy platform key — managed here (not the generic provider rows):
           it exists solely for this feature, and "Live" is gated on it. -->
      <div class="rounded-md bg-muted/40 border border-border p-3 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="font-cinzel text-xs font-semibold tracking-wide text-foreground">Meshy platform key</span>
          <template v-if="meshyKeySet">
            <span class="text-eyebrow text-green-500">
              Set · {{ meshyKeyDate }}
            </span>
          </template>
        </div>
        <div v-if="!meshyKeySet || replacingKey" class="flex items-center gap-2">
          <input
            v-model="keyDraft"
            :type="keyDraftVisible ? 'text' : 'password'"
            placeholder="msy-…"
            class="flex-1 bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            class="px-2 py-1.5 font-cinzel text-2xs text-muted-foreground border border-border rounded hover:text-foreground transition-colors"
            @click="keyDraftVisible = !keyDraftVisible"
          >
            {{ keyDraftVisible ? 'Hide' : 'Show' }}
          </button>
          <button
            type="button"
            :disabled="!keyDraft.trim() || setKey.isPending.value"
            class="px-3 py-1.5 font-cinzel text-2xs font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="saveKey"
          >
            {{ setKey.isPending.value ? 'Saving…' : 'Save key' }}
          </button>
        </div>
        <div v-else class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-1.5 font-cinzel text-2xs text-muted-foreground border border-border rounded hover:text-foreground transition-colors"
            @click="replacingKey = true"
          >
            Replace
          </button>
          <button
            type="button"
            :disabled="clearKey.isPending.value"
            class="px-3 py-1.5 font-cinzel text-2xs text-destructive border border-destructive/40 rounded hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            @click="doClearKey"
          >
            {{ clearKey.isPending.value ? '…' : 'Clear' }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          v-for="opt in MODE_OPTIONS"
          :key="opt.value"
          type="button"
          :disabled="opt.value === 'live' && !meshyKeySet"
          class="flex flex-col gap-1 rounded-md border p-3 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :class="localMode === opt.value
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-primary/50'"
          @click="localMode = opt.value"
        >
          <span class="font-cinzel text-xs font-semibold tracking-wide text-foreground">{{ opt.label }}</span>
          <span class="font-fell text-2xs text-muted-foreground">
            {{ opt.value === 'live' && !meshyKeySet ? 'Locked — add the Meshy platform key first.' : opt.description }}
          </span>
        </button>
      </div>
      <p v-if="query.data.value?.mode === 'live' && !meshyKeySet" class="font-fell text-xs text-destructive">
        Mode is Live but the Meshy key is missing — sculpts will fail until a key is added.
      </p>

      <div class="flex items-center gap-2">
        <button
          class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          :disabled="update.isPending.value || localMode === query.data.value?.mode"
          @click="save"
        >
          {{ update.isPending.value ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="saved" class="font-fell text-xs text-green-500 self-center">Saved.</span>
      </div>

      <!-- Buy-signal counter -->
      <div class="rounded-md bg-muted/40 border border-border p-3">
        <!-- "…" while loading — a not-yet-loaded count must never read as "zero interest". -->
        <p class="font-fell text-sm text-foreground">
          <span class="font-cinzel font-semibold">{{ interestCount.data.value ?? "…" }}</span>
          adventurer{{ interestCount.data.value === 1 ? '' : 's' }} await the ritual
        </p>
        <p class="font-fell text-2xs text-muted-foreground italic mt-0.5">
          Users who clicked "Notify me" on the teaser — the signal for buying the Meshy subscription.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSimulacrumConfig, useUpdateSimulacrumMode } from "@/composables/useSimulacrumConfig";
import { useFeatureInterestCount } from "@/composables/useFeatureInterest";
import { useAdminKeys } from "@/composables/useAdminKeys";
import { SIMULACRUM_FEATURE_KEY, type SimulacrumMode } from "@/types/mini.types";

const { query } = useSimulacrumConfig();
const update = useUpdateSimulacrumMode();
const interestCount = useFeatureInterestCount(SIMULACRUM_FEATURE_KEY);

// ── Meshy platform key (same vault flow as the generic provider keys) ──────
const { keysQuery, setKey, clearKey } = useAdminKeys();
const meshyRow = computed(() => keysQuery.data.value?.find((r) => r.provider === "meshy") ?? null);
const meshyKeySet = computed(() => !!meshyRow.value);
const meshyKeyDate = computed(() =>
  meshyRow.value ? new Date(meshyRow.value.updated_at).toLocaleDateString() : "",
);

const keyDraft = ref("");
const keyDraftVisible = ref(false);
const replacingKey = ref(false);

async function saveKey() {
  await setKey.mutateAsync({ provider: "meshy", plaintext: keyDraft.value.trim() });
  keyDraft.value = "";
  replacingKey.value = false;
}

async function doClearKey() {
  await clearKey.mutateAsync("meshy");
  // Live mode without a key is a broken pipeline — drop the draft off "live"
  // so Save can't persist it past the disabled option.
  if (localMode.value === "live") localMode.value = "teaser";
}

const MODE_OPTIONS: { value: SimulacrumMode; label: string; description: string }[] = [
  { value: "hidden", label: "Hidden", description: "No entry points anywhere. Default." },
  { value: "teaser", label: "Teaser", description: "Entry points visible; wizard shows the demand gate." },
  { value: "live", label: "Live", description: "Real pipeline — requires the Meshy platform key." },
];

const localMode = ref<SimulacrumMode>("hidden");
const saved = ref(false);

watch(
  () => query.data.value?.mode,
  (mode) => {
    if (mode) localMode.value = mode;
  },
  { immediate: true },
);

async function save() {
  // Belt-and-suspenders with the disabled option: live is never saved keyless.
  if (localMode.value === "live" && !meshyKeySet.value) return;
  await update.mutateAsync(localMode.value);
  saved.value = true;
  setTimeout(() => (saved.value = false), 3000);
}
</script>
