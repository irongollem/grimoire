<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Simulacrum</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Feature flag for the portrait → 3D mini pipeline. "Teaser" ships the entry point + demand
        gate before the Meshy subscription exists; "Live" is the real pipeline (requires the Meshy
        platform key).
      </p>
    </div>

    <p v-if="query.isPending.value" class="text-body text-muted-foreground">Loading…</p>

    <template v-else>
      <!-- Meshy platform key — managed here (not the generic provider rows):
           it exists solely for this feature, and "Live" is gated on it. -->
      <PlatformKeyField provider="meshy" label="Meshy platform key" hint="msy-…" @cleared="onKeyCleared" />

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
          <span class="text-caption-sm text-muted-foreground">
            {{ opt.value === 'live' && !meshyKeySet ? 'Locked — add the Meshy platform key first.' : opt.description }}
          </span>
        </button>
      </div>
      <p v-if="query.data.value?.mode === 'live' && !meshyKeySet" class="text-caption text-destructive">
        Mode is Live but the Meshy key is missing — sculpts will fail until a key is added.
      </p>

      <div class="flex items-center gap-2">
        <AppButton
          variant="primary"
          size="sm"
          :disabled="update.isPending.value || localMode === query.data.value?.mode"
          @click="save"
        >
          {{ update.isPending.value ? 'Saving…' : 'Save' }}
        </AppButton>
        <span v-if="saved" class="text-caption text-green-500 self-center">Saved.</span>
      </div>

      <!-- Buy-signal counter -->
      <div class="rounded-md bg-muted/40 border border-border p-3">
        <!-- "…" while loading — a not-yet-loaded count must never read as "zero interest". -->
        <p class="text-body text-foreground">
          <span class="font-cinzel font-semibold">{{ interestCount.data.value ?? "…" }}</span>
          adventurer{{ interestCount.data.value === 1 ? '' : 's' }} await the ritual
        </p>
        <p class="text-caption-sm text-muted-foreground italic mt-0.5">
          Users who clicked "Notify me" on the teaser — the signal for buying the Meshy subscription.
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSimulacrumConfig, useUpdateSimulacrumMode } from "@/composables/simulacrum/useSimulacrumConfig";
import { useFeatureInterestCount } from "@/composables/simulacrum/useFeatureInterest";
import { useAdminKeys } from "@/composables/admin/useAdminKeys";
import { SIMULACRUM_FEATURE_KEY, type SimulacrumMode } from "@/types/mini.types";
import PlatformKeyField from "@/components/admin/PlatformKeyField.vue";
import AppButton from "@/components/common/AppButton.vue";

const { query } = useSimulacrumConfig();
const update = useUpdateSimulacrumMode();
const interestCount = useFeatureInterestCount(SIMULACRUM_FEATURE_KEY);

// ── Meshy platform key (same vault flow as the generic provider keys) ──────
const { keysQuery } = useAdminKeys();
const meshyKeySet = computed(() => !!keysQuery.data.value?.find((r) => r.provider === "meshy"));

function onKeyCleared() {
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
