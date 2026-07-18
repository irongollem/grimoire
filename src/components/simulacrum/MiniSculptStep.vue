<template>
  <div class="space-y-4">
    <!-- Idle — first sculpt is paid; a re-stylized image after a completed
         sculpt re-enters here with sculpt_count >= 1, where sculpting the new
         image is a FREE retry (backend resculpt) -->
    <template v-if="phase === 'idle'">
      <div class="aspect-square w-full max-w-xs mx-auto overflow-hidden rounded-lg border border-border bg-muted">
        <img
          v-if="mini.stylized_image_url"
          :src="mini.stylized_image_url"
          alt="Stylized render"
          class="h-full w-full object-cover"
        />
        <div v-else class="flex h-full w-full items-center justify-center font-fell text-xs text-muted-foreground italic">
          Stylized render missing — go back and re-roll.
        </div>
      </div>
      <div class="flex flex-col items-center gap-1.5">
        <button
          type="button"
          :disabled="isFirstSculpt ? !affordable(sculptCost) : resculptsLeft <= 0"
          class="inline-flex items-center justify-center gap-1.5 px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="isFirstSculpt ? runSculpt() : runResculpt()"
        >
          {{ isFirstSculpt ? "Sculpt" : `Sculpt new image (free, ${resculptsLeft} left)` }}
        </button>
        <GenerationCostBadge v-if="isFirstSculpt" :credits="sculptCost" />
        <p v-if="isFirstSculpt && !affordable(sculptCost)" class="font-fell text-xs text-destructive">
          Not enough credits — buy a pack or wait for the monthly refresh.
        </p>
        <p v-if="isFirstSculpt" class="font-fell text-2xs text-muted-foreground/70 italic text-center max-w-xs">
          Includes up to {{ MAX_SCULPTS - 1 }} free re-sculpts if the first pass doesn't land.
        </p>
      </div>
      <div class="flex justify-start pt-2 border-t border-border">
        <button
          type="button"
          class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
          @click="emit('back')"
        >
          ← Back to stylize
        </button>
      </div>
    </template>

    <!-- In progress -->
    <template v-else-if="phase === 'progress'">
      <div class="flex flex-col items-center gap-3 py-8">
        <IconLoading class="h-8 w-8 animate-spin text-primary" />
        <p class="font-fell text-sm text-muted-foreground italic text-center">
          The simulacrum takes shape…
        </p>
        <p class="font-cinzel text-2xs tracking-wider text-muted-foreground/70 uppercase">
          {{ MINI_STATUS_LABELS[mini.status] }}
        </p>
      </div>
    </template>

    <!-- Ready — preview + accept / re-sculpt / back -->
    <template v-else-if="phase === 'ready'">
      <MiniModelViewer
        v-if="glbUrl"
        :src="glbUrl"
        :poster="mini.thumbnail_url ?? mini.stylized_image_url ?? undefined"
      />
      <p v-else class="font-fell text-xs text-destructive text-center">
        The model file is missing — try a re-sculpt.
      </p>

      <!-- Base & scale — free, instant swap; no Meshy re-run -->
      <div class="flex flex-col items-center gap-1.5 pt-1">
        <p class="font-cinzel text-2xs tracking-wider text-muted-foreground uppercase">Base &amp; scale</p>
        <div class="flex items-center gap-2">
          <button
            v-for="base in MINI_BASES"
            :key="base.id"
            type="button"
            class="h-6 w-6 rounded-full transition-all disabled:opacity-50"
            :class="mini.base_id === base.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'ring-1 ring-border hover:ring-foreground/40'"
            :style="{ backgroundColor: base.color }"
            :title="base.label"
            :disabled="isRebasing"
            @click="applyBase(base.id, mini.scale_mm as MiniBaseScale)"
          />
          <span class="w-px h-5 bg-border" />
          <div class="flex items-center gap-1">
            <button
              v-for="scale in SCALE_OPTIONS"
              :key="scale"
              type="button"
              class="px-2 py-1 rounded font-cinzel text-2xs tracking-wider border transition-colors disabled:opacity-50"
              :class="mini.scale_mm === scale
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground'"
              :disabled="isRebasing"
              @click="applyBase(mini.base_id ?? DEFAULT_BASE_ID, scale)"
            >{{ scale }}mm</button>
          </div>
          <IconLoading v-if="isRebasing" class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
        <button
          type="button"
          class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          @click="accept"
        >
          Accept
        </button>
        <button
          type="button"
          :disabled="resculptsLeft <= 0"
          class="px-4 py-2 font-cinzel text-xs font-semibold border border-border rounded-md hover:text-foreground text-muted-foreground disabled:opacity-40 transition-colors"
          @click="runResculpt"
        >
          Re-sculpt ({{ resculptsLeft }} left) · free
        </button>
      </div>
      <div class="flex justify-start pt-2 border-t border-border">
        <button
          type="button"
          class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
          @click="emit('back')"
        >
          ← Back to stylize (paid tweak)
        </button>
      </div>
    </template>

    <!-- Failed — retry -->
    <template v-else>
      <div class="flex flex-col items-center gap-3 py-6 text-center">
        <IconWarning class="h-6 w-6 text-destructive" />
        <p class="font-fell text-sm text-destructive">{{ mini.error ?? 'The sculpt failed.' }}</p>
        <button
          type="button"
          class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          @click="retry"
        >
          {{ mini.sculpt_count === 0 ? 'Try again' : 'Re-sculpt (free)' }}
        </button>
      </div>
    </template>

    <p v-if="error" class="font-fell text-xs text-destructive text-center">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { IconLoading, IconWarning } from "@/lib/icons";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import MiniModelViewer from "@/components/simulacrum/MiniModelViewer.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useMiniForge } from "@/ai/useMiniForge";
import { getPublicUrl } from "@/lib/storage";
import { MINI_BASES, DEFAULT_BASE_ID } from "@/data/miniBases";
import { MAX_SCULPTS, MINI_STATUS_LABELS } from "@/types/mini.types";
import type { Mini } from "@/types/mini.types";

type MiniBaseScale = 28 | 32;
const SCALE_OPTIONS: MiniBaseScale[] = [28, 32];

const { mini } = defineProps<{ mini: Mini }>();

const emit = defineEmits<{
  "update:mini": [Mini];
  back: [];
}>();

const router = useRouter();
const { costOf, affordable } = useAiCredits();
const { sculpt, resculpt, setBase, waitForSculpt, isRebasing } = useMiniForge();

const sculptCost = computed(() => costOf("mini_sculpt"));
const resculptsLeft = computed(() => MAX_SCULPTS - mini.sculpt_count);
// Only the very first completed sculpt is paid — everything after rides the
// free-retry cap, including sculpting a re-stylized image (plan §5).
const isFirstSculpt = computed(() => mini.sculpt_count === 0);
// Cache-bust: a base/scale swap recomposes the file in place at the same
// storage path, so the URL must change (via updated_at) or the browser/CDN
// would keep serving the pre-swap geometry.
const glbUrl = computed(() =>
  mini.glb_path ? `${getPublicUrl("miniModels", mini.glb_path)}?v=${mini.updated_at}` : null,
);

// "waiting" tracks whether we're actively polling — separate from mini.status
// so the spinner shows the instant the request fires, before the row flips.
const waiting = ref(false);
const error = ref<string | null>(null);

const phase = computed<"idle" | "progress" | "ready" | "failed">(() => {
  if (mini.status === "ready") return "ready";
  if (mini.status === "failed") return "failed";
  if (waiting.value || mini.status === "sculpting" || mini.status === "downloading") return "progress";
  return "idle";
});

async function awaitCompletion() {
  waiting.value = true;
  error.value = null;
  try {
    const updated = await waitForSculpt(mini.id);
    emit("update:mini", updated);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "The sculpt failed.";
  } finally {
    waiting.value = false;
  }
}

async function runSculpt() {
  error.value = null;
  try {
    await sculpt(mini.id);
    await awaitCompletion();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to start the sculpt.";
  }
}

async function runResculpt() {
  error.value = null;
  try {
    await resculpt(mini.id);
    await awaitCompletion();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to start the re-sculpt.";
  }
}

// Failed retry: a fresh paid sculpt if nothing ever completed, otherwise a
// free re-sculpt — sculpt_count only counts *completed* sculpts, so a failed
// attempt never consumes the cap.
function retry() {
  if (mini.sculpt_count === 0) void runSculpt();
  else void runResculpt();
}

function accept() {
  router.push("/minis");
}

/** Free, instant base/scale swap — server recomposes glb/stl, we refetch + re-emit to bust the viewer. */
async function applyBase(baseId: string, scaleMm: MiniBaseScale) {
  error.value = null;
  try {
    const updated = await setBase(mini.id, baseId, scaleMm);
    emit("update:mini", updated);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to swap the base.";
  }
}

// Resume flow: the mini may already be mid-sculpt (route reopened while a
// job was in flight) — pick the wait back up without re-firing the request.
onMounted(() => {
  if (mini.status === "sculpting" || mini.status === "downloading") void awaitCompletion();
});

watch(
  () => mini.id,
  () => {
    if (mini.status === "sculpting" || mini.status === "downloading") void awaitCompletion();
  },
);
</script>
