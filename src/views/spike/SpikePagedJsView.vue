<template>
  <div class="flex flex-col gap-3 p-4 h-full min-h-0">
    <div class="flex items-center gap-3 flex-wrap shrink-0">
      <h1 class="font-cinzel text-lg font-bold">Paged.js Spike (#330)</h1>

      <select
        v-model="scenario"
        class="rounded border border-border bg-card px-2 py-1 font-cinzel text-xs"
      >
        <option v-for="s in SPIKE_SCENARIOS" :key="s" :value="s">{{ s }}</option>
      </select>

      <select
        v-model.number="targetPages"
        class="rounded border border-border bg-card px-2 py-1 font-cinzel text-xs"
      >
        <option :value="10">~10 pages</option>
        <option :value="30">~30 pages</option>
        <option :value="60">~60 pages</option>
        <option :value="100">~100 pages</option>
      </select>

      <button
        type="button"
        :disabled="isRendering"
        class="rounded border border-border px-3 py-1 font-cinzel text-xs font-semibold tracking-wider uppercase hover:bg-muted disabled:opacity-50"
        @click="run"
      >
        {{ isRendering ? "Rendering…" : "Render" }}
      </button>

      <button
        type="button"
        :disabled="isRendering || !lastResult"
        class="rounded border border-border px-3 py-1 font-cinzel text-xs font-semibold tracking-wider uppercase hover:bg-muted disabled:opacity-50"
        @click="printSpike"
      >
        Print
      </button>

      <span v-if="lastResult" class="font-fell text-xs text-muted-foreground">
        {{ lastResult.pages }} pages · layout {{ lastResult.ms }} ms
      </span>
      <span v-if="error" class="font-fell text-xs text-destructive">{{ error }}</span>
    </div>

    <div class="flex-1 min-h-0 overflow-auto rounded-lg border border-border" style="background: #a09a90">
      <div ref="stageRef" class="spike-stage sc-theme theme-onednd2024 p-6" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Previewer } from "pagedjs";
import {
  buildSpikeContent,
  SPIKE_SCENARIOS,
  type SpikeScenario,
} from "@/lib/scriptorium/spike/spikeContent";

/* Served from public/ as a plain URL — Paged.js fetches and parses it itself
   (blob: URLs break its internal relative-URL resolution). */
const SPIKE_PRINT_CSS_URL = "/assets/scriptorium/spike-print.css";

const scenario = ref<SpikeScenario>("full");
const targetPages = ref(30);
const isRendering = ref(false);
const error = ref("");
const lastResult = ref<{ pages: number; ms: number } | null>(null);
const stageRef = ref<HTMLElement | null>(null);

async function run() {
  const stage = stageRef.value;
  if (!stage || isRendering.value) return;
  isRendering.value = true;
  error.value = "";
  lastResult.value = null;
  stage.innerHTML = "";
  try {
    const html = buildSpikeContent(scenario.value, targetPages.value);
    const t0 = performance.now();
    const previewer = new Previewer();
    const flow = await previewer.preview(html, [SPIKE_PRINT_CSS_URL], stage);
    lastResult.value = {
      pages: flow.total,
      ms: Math.round(performance.now() - t0),
    };
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    isRendering.value = false;
  }
}

function printSpike() {
  window.print();
}

onMounted(run);
</script>

<style scoped>
/* Let the rendered pages keep their natural A4 size inside the scroll area */
.spike-stage :deep(.pagedjs_page) {
  flex: none;
}
</style>

<style>
/* Print: only the paged output, unconstrained — app chrome and the scroll
   container must not clip or offset the pages. Unscoped on purpose: print
   rules need to reach layout elements outside this component. */
@media print {
  aside,
  nav,
  header {
    display: none !important;
  }
  body * {
    visibility: hidden;
  }
  .spike-stage,
  .spike-stage * {
    visibility: visible;
  }
  .spike-stage {
    position: absolute;
    inset: 0;
    padding: 0 !important;
  }
  .pagedjs_page {
    box-shadow: none !important;
    margin: 0 !important;
  }
}
</style>
