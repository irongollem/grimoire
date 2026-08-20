<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Variant Sweep</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Scans shared and your own image folders for originals missing pre-generated size variants, and backfills them.
      </p>
    </div>

    <div class="flex items-center gap-2">
      <AppButton
        variant="primary"
        size="sm"
        :disabled="scanning || backfilling"
        @click="runScan"
      >
        {{ scanning ? 'Scanning…' : hasScanned ? 'Re-scan' : 'Scan' }}
      </AppButton>
      <button
        v-if="hasScanned && totalMissing > 0"
        type="button"
        class="px-4 py-1.5 text-label-lg font-semibold border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
        :disabled="scanning || backfilling"
        @click="runBackfill"
      >
        {{ backfilling ? 'Backfilling…' : `Backfill ${totalMissing} missing` }}
      </button>
    </div>

    <template v-if="rows.length > 0">
      <div v-if="visibleRows.length > 0" class="space-y-1">
        <div class="flex items-center gap-2 px-2.5 pb-0.5">
          <span class="flex-1 text-eyebrow text-muted-foreground">Location</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-20 text-right">Originals</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-20 text-right">Complete</span>
          <span class="text-eyebrow text-muted-foreground shrink-0 w-20 text-right">Missing</span>
        </div>
        <div
          v-for="row in visibleRows"
          :key="row.label"
          class="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5"
        >
          <span class="flex-1 min-w-0 text-body text-foreground truncate">{{ row.label }}</span>
          <IconLoading
            v-if="row.pending"
            class="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0 ml-auto"
          />
          <template v-else>
            <span class="text-caption text-muted-foreground shrink-0 w-20 text-right">{{ row.originals }}</span>
            <span class="text-caption text-muted-foreground shrink-0 w-20 text-right">{{ row.complete }}</span>
            <span
              class="font-cinzel text-xs shrink-0 w-20 text-right"
              :class="row.missingCount > 0 ? 'text-amber-400' : 'text-muted-foreground'"
            >{{ row.missingCount }}</span>
          </template>
        </div>
      </div>

      <p v-if="scanning" class="flex items-center gap-2 text-caption text-muted-foreground">
        <IconLoading class="h-4 w-4 text-primary animate-spin shrink-0" />
        <span>Scanning {{ currentTargetLabel }}…</span>
      </p>

      <template v-else>
        <p v-if="totalMissing === 0" class="text-caption text-muted-foreground italic">
          All originals have their variants — {{ rows.length }} location{{ rows.length === 1 ? '' : 's' }} scanned, nothing to backfill.
        </p>
        <p v-else class="text-caption text-muted-foreground">
          {{ totalMissing }} original{{ totalMissing === 1 ? '' : 's' }} missing variants across
          {{ locationsWithMissing }} location{{ locationsWithMissing === 1 ? '' : 's' }}.
        </p>
      </template>

      <p v-if="backfilling" class="flex items-center gap-2 text-caption text-muted-foreground">
        <IconLoading class="h-4 w-4 text-primary animate-spin shrink-0" />
        <span>healed {{ backfillProgress.healed }} / {{ backfillProgress.total }} ({{ backfillProgress.failed }} failed)</span>
      </p>
      <p
        v-else-if="backfillDone"
        class="text-caption"
        :class="backfillProgress.failed > 0 ? 'text-amber-400' : 'text-green-500'"
      >
        Backfill complete — healed {{ backfillProgress.healed }} / {{ backfillProgress.total }}.
        <template v-if="backfillProgress.failed > 0">{{ backfillProgress.failed }} failed — re-run the scan to check what's left.</template>
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Admin backfill for missing pre-generated image size variants (#619).
 *
 * The organic self-heal (`backfillVariants`) only fires on pages an admin or
 * the owning user happens to browse, so originals in a shared `srd/` prefix
 * nobody visits can go unhealed indefinitely. This panel is the deliberate
 * version: enumerate every sweep target (`sweepTargets`), find originals
 * missing one or more variants (`planVariantSweep`), and heal them on demand
 * via the same `healVariants` the organic path uses.
 */
import { ref, computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import {
  sweepTargets, targetLabel, listPathsUnder, planVariantSweep, healVariants,
  type SweepTarget, type MissingVariants,
} from "@/lib/storage";
import { IconLoading } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";

interface SweepRow {
  target: SweepTarget;
  label: string;
  originals: number;
  complete: number;
  missingCount: number;
  worklist: MissingVariants[];
  /** True while this row's listing + plan is still in flight. */
  pending: boolean;
}

const auth = useAuthStore();

const scanning = ref(false);
const hasScanned = ref(false);
const currentTargetLabel = ref("");
const rows = ref<SweepRow[]>([]);

const backfilling = ref(false);
const backfillDone = ref(false);
const backfillProgress = ref({ healed: 0, failed: 0, total: 0 });

// Rows with zero originals are muted noise (an empty user folder in a bucket
// nobody has uploaded to yet) — hidden from the list, but they never
// contribute to the totals below regardless, so hiding them changes nothing
// but the visual clutter.
const visibleRows = computed(() => rows.value.filter((r) => r.pending || r.originals > 0));
const totalMissing = computed(() => rows.value.reduce((sum, r) => sum + r.missingCount, 0));
const locationsWithMissing = computed(() => rows.value.filter((r) => r.missingCount > 0).length);

async function runScan() {
  const userId = auth.user?.id;
  if (!userId || scanning.value || backfilling.value) return;

  scanning.value = true;
  hasScanned.value = false;
  backfillDone.value = false;
  rows.value = [];

  try {
    // Sequential, not pooled — this walks shared srd/ prefixes plus the admin's
    // own folder across every variant-generating bucket, and each listing
    // already merges two backing stores (list.ts). Running them one at a time
    // keeps the network shape predictable on a tab that hosts several other
    // panels doing their own fetching.
    for (const target of sweepTargets(userId)) {
      const label = targetLabel(target, userId);
      currentTargetLabel.value = label;

      rows.value.push({
        target,
        label,
        originals: 0,
        complete: 0,
        missingCount: 0,
        worklist: [],
        pending: true,
      });
      // Mutate the reactive proxy the array hands back, NOT the local literal —
      // writes to the raw object bypass Vue's set trap, so each row's numbers
      // would only render when something else (the next push) forced an update.
      const row = rows.value[rows.value.length - 1];

      const paths = await listPathsUnder(target.bucket, target.prefix);
      const plan = planVariantSweep(paths);

      row.originals = plan.originals;
      row.complete = plan.complete;
      row.missingCount = plan.worklist.length;
      row.worklist = [...plan.worklist];
      row.pending = false;
    }
    hasScanned.value = true;
  } finally {
    // A throw mid-scan must never strand the panel with both buttons disabled.
    currentTargetLabel.value = "";
    scanning.value = false;
  }
}

async function runBackfill() {
  if (backfilling.value || scanning.value) return;

  interface WorkItem {
    rowIndex: number;
    item: MissingVariants;
  }
  const items: WorkItem[] = [];
  rows.value.forEach((row, rowIndex) => {
    row.worklist.forEach((item) => items.push({ rowIndex, item }));
  });
  if (items.length === 0) return;

  backfilling.value = true;
  backfillDone.value = false;
  backfillProgress.value = { healed: 0, failed: 0, total: items.length };

  // Simple worker-pool over a shared index, same shape as `pooled()` in
  // scripts/r2-copy.ts — a handful of runners pull from one cursor rather
  // than kicking off `items.length` fetches at once.
  const CONCURRENCY = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const { rowIndex, item } = items[cursor++];
      const row = rows.value[rowIndex];

      let healed = false;
      try {
        const result = await healVariants(row.target.bucket, item.path);
        healed = result.failed === 0;
      } catch {
        healed = false;
      }

      if (healed) {
        backfillProgress.value.healed++;
        const idx = row.worklist.findIndex((w) => w.path === item.path);
        if (idx !== -1) row.worklist.splice(idx, 1);
        row.missingCount = row.worklist.length;
        row.complete = row.originals - row.missingCount;
      } else {
        backfillProgress.value.failed++;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  } finally {
    backfilling.value = false;
    backfillDone.value = true;
  }
}
</script>
