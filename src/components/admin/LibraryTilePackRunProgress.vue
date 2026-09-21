<template>
  <div class="rounded-md border border-border bg-background/40 p-3 space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div>
        <p class="text-label-lg text-foreground">{{ run.status.replaceAll('_', ' ') }}</p>
        <p class="text-caption text-muted-foreground">{{ run.completed_jobs }} / {{ run.total_jobs }} tiles</p>
      </div>
      <AppButton
        v-if="canCancel"
        variant="ghost"
        size="xs"
        tone="danger"
        label="Cancel run"
        @click="cancelRun"
      />
    </div>

    <div class="h-1.5 overflow-hidden rounded-full bg-muted">
      <div class="h-full bg-primary transition-[width]" :style="{ width: `${progressPct}%` }" />
    </div>

    <p v-if="run.error" class="text-caption text-tone-danger">{{ run.error }}</p>
    <p v-if="error" class="text-caption text-tone-danger">{{ error }}</p>

    <!-- Proof approval: the one step that needs a human eye. -->
    <div v-if="run.status === 'awaiting_approval'" class="space-y-2">
      <p class="text-caption text-muted-foreground">
        Approve this style family before the remaining tiles generate.
      </p>
      <div class="grid grid-cols-3 gap-2">
        <div v-for="entry in proofPreviews" :key="entry.job.id" class="space-y-1">
          <img
            v-if="entry.url"
            :src="entry.url"
            alt="Generated tile-pack style proof"
            class="aspect-square w-full rounded border border-border bg-black/20 object-contain [image-rendering:pixelated]"
          />
          <AppButton
            v-if="attemptsLeft(entry.job) > 0"
            variant="ghost"
            size="caption"
            block
            :label="`Regenerate (${attemptsLeft(entry.job)} left)`"
            @click="regenerateProof(entry.job.id)"
          />
          <p v-else class="text-center text-caption-sm text-muted-foreground">No retries left</p>
        </div>
      </div>
      <AppButton variant="primary" size="sm" label="Approve and generate pack" @click="approveAndRun" />
    </div>

    <AppButton
      v-else-if="run.status === 'proof_pending' || run.status === 'generating'"
      variant="outline"
      size="sm"
      :label="running ? 'Generating…' : run.status === 'proof_pending' ? 'Generate proof' : 'Continue generation'"
      :loading="running"
      :disabled="running"
      @click="continueRun"
    />

    <!-- Live per-slot state. -->
    <div class="space-y-2">
      <!-- A gap-filling run on a pack that already has its floor/wall/solidBlock
           tiles plans no proof jobs at all (#900), so this group would render as
           a heading over an empty row. Before that, every run had a proof phase
           and the heading could be unconditional. -->
      <div v-if="proofJobs.length">
        <p class="text-eyebrow text-muted-foreground mb-1">Proof</p>
        <div class="flex flex-wrap gap-1">
          <div
            v-for="job in proofJobs"
            :key="job.id"
            class="flex h-6 w-6 items-center justify-center rounded border"
            :class="chipClasses(job.status)"
            :title="chipTitle(job)"
          >
            <component :is="chipIcon(job.status)" :class="chipIconClass(job.status)" />
          </div>
        </div>
      </div>
      <div>
        <p class="text-eyebrow text-muted-foreground mb-1">Pack</p>
        <div class="flex flex-wrap gap-1">
          <div
            v-for="job in packJobs"
            :key="job.id"
            class="flex h-6 w-6 items-center justify-center rounded border"
            :class="chipClasses(job.status)"
            :title="chipTitle(job)"
          >
            <component :is="chipIcon(job.status)" :class="chipIconClass(job.status)" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="failedJobs.length" class="space-y-1">
      <div v-for="job in failedJobs" :key="job.id" class="flex items-center justify-between gap-2 text-caption">
        <span class="truncate text-tone-danger">{{ job.slot_id }}: {{ job.error }}</span>
        <AppButton
          v-if="attemptsLeft(job) > 0"
          variant="ghost"
          size="caption"
          :label="`Retry (${attemptsLeft(job)} left)`"
          @click="retryJob(job.id)"
        />
        <span v-else class="shrink-0 text-muted-foreground">No retries left</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * #889 S5 — drives one library-lane generation run: proof approval, the full
 * pack, per-slot live state and retry.
 *
 * Reuses `useTilePacks()` for the actual driving (`runUntilPause`, `action`)
 * because the edge function resolves the lane from the run row itself — see
 * the composable's own docs. This component owns only the library-specific
 * half: rendering a slot's bytes from the public `library-tile-packs` bucket
 * via `libraryPackObjectPath` + `getPublicUrl`, never `signJobAssets` (that
 * signs the private `tile-packs` bucket and would not resolve here).
 *
 * A DB-level job never actually reaches "rejected" (regenerating a proof
 * tile resets its row straight to "pending" — see packTarget/index.ts) but
 * the chip mapping below stays exhaustive over the full `JobStatus` union
 * rather than assuming that, since it costs nothing and the DB type admits
 * the value.
 */
import { computed, ref, type Component } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconCheck, IconLoading, IconWarning, IconClose, IconRefresh, IconCircle } from "@/lib/icons";
import { useTilePacks } from "@/composables/cartographer/useTilePacks";
import { libraryPackObjectPath } from "@/composables/cartographer/useLibraryTilePacks";
import { getPublicUrl } from "@/lib/storage";
import { slotRelativePath } from "@/cartographer/authoringPlan";
import { attemptsRemaining } from "@/cartographer/generationBudget";
import type { LibraryTilePack, TilePackGenerationJob, TilePackGenerationRun } from "@/cartographer/userPack.types";

type RunWithJobs = TilePackGenerationRun & { tile_pack_generation_jobs: TilePackGenerationJob[] };

const props = defineProps<{
  pack: LibraryTilePack;
  run: RunWithJobs;
}>();

const { runUntilPause, action } = useTilePacks();

const running = ref(false);
const error = ref("");

const proofJobs = computed(() =>
  [...props.run.tile_pack_generation_jobs].filter((job) => job.phase === "proof").sort((a, b) => a.ordinal - b.ordinal),
);
const packJobs = computed(() =>
  [...props.run.tile_pack_generation_jobs].filter((job) => job.phase === "pack").sort((a, b) => a.ordinal - b.ordinal),
);
const failedJobs = computed(() => props.run.tile_pack_generation_jobs.filter((job) => job.status === "failed"));
const proofPreviews = computed(() => proofJobs.value.map((job) => ({ job, url: tileImageUrl(job) })));

const canCancel = computed(() => !["completed", "cancelled", "failed"].includes(props.run.status));
const progressPct = computed(() =>
  props.run.total_jobs > 0 ? Math.round((props.run.completed_jobs / props.run.total_jobs) * 100) : 0,
);

function tileImageUrl(job: TilePackGenerationJob): string | null {
  if (job.status !== "normalized") return null;
  const relative = slotRelativePath(job.job.slot);
  return getPublicUrl("libraryTilePacks", libraryPackObjectPath(props.pack, relative));
}

function attemptsLeft(job: TilePackGenerationJob): number {
  return attemptsRemaining(job.generation_attempts);
}

async function continueRun(): Promise<void> {
  running.value = true;
  error.value = "";
  try {
    await runUntilPause(props.run.id);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Generation failed";
  } finally {
    running.value = false;
  }
}

async function approveAndRun(): Promise<void> {
  error.value = "";
  try {
    await action(props.run.id, "approve_proof");
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not approve the proof";
    return;
  }
  await continueRun();
}

async function cancelRun(): Promise<void> {
  error.value = "";
  try {
    await action(props.run.id, "cancel");
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not cancel the run";
  }
}

async function retryJob(jobId: string): Promise<void> {
  error.value = "";
  try {
    await action(props.run.id, "retry_job", jobId);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Retry failed";
    return;
  }
  await continueRun();
}

async function regenerateProof(jobId: string): Promise<void> {
  error.value = "";
  try {
    await action(props.run.id, "regenerate_job", jobId);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not regenerate this tile";
    return;
  }
  await continueRun();
}

function chipIcon(status: TilePackGenerationJob["status"]): Component {
  switch (status) {
    case "normalized": return IconCheck;
    case "generating":
    case "generated": return IconLoading;
    case "failed": return IconWarning;
    case "cancelled": return IconClose;
    case "rejected": return IconRefresh;
    default: return IconCircle;
  }
}

function chipIconClass(status: TilePackGenerationJob["status"]): string {
  const spinning = status === "generating" || status === "generated";
  return spinning ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5";
}

function chipClasses(status: TilePackGenerationJob["status"]): string {
  switch (status) {
    case "normalized": return "border-tone-success/40 bg-tone-success/10 text-tone-success";
    case "generating":
    case "generated": return "border-tone-arcane/40 bg-tone-arcane/10 text-tone-arcane";
    case "failed": return "border-tone-danger/40 bg-tone-danger/10 text-tone-danger";
    case "cancelled": return "border-border bg-muted text-muted-foreground";
    case "rejected": return "border-tone-caution/40 bg-tone-caution/10 text-tone-caution";
    default: return "border-border bg-background text-muted-foreground/60";
  }
}

function chipTitle(job: TilePackGenerationJob): string {
  if (job.status === "failed" && job.error) return `${job.slot_id}: ${job.error}`;
  return `${job.slot_id} — ${job.status}`;
}
</script>
