<template>
  <div class="flex flex-col gap-3 p-4 h-full min-h-0">
    <div class="flex items-center gap-3 flex-wrap shrink-0">
      <h1 class="text-heading font-bold">Paged.js Spike (#330)</h1>

      <AppSelect v-model="scenario" size="sm" weight="normal">
        <option v-for="s in SPIKE_SCENARIOS" :key="s" :value="s">{{ s }}</option>
      </AppSelect>

      <AppSelect v-model.number="targetPages" size="sm" weight="normal">
        <option :value="10">~10 pages</option>
        <option :value="30">~30 pages</option>
        <option :value="60">~60 pages</option>
        <option :value="100">~100 pages</option>
      </AppSelect>

      <button
        type="button"
        :disabled="isRendering"
        class="rounded border border-border px-3 py-1 text-label-lg font-semibold uppercase hover:bg-muted disabled:opacity-50"
        @click="renderNow"
      >
        {{ isRendering ? "Rendering…" : "Render" }}
      </button>

      <button
        type="button"
        :disabled="isRendering || pageCount === 0"
        class="rounded border border-border px-3 py-1 text-label-lg font-semibold uppercase hover:bg-muted disabled:opacity-50"
        @click="printSpike"
      >
        Print
      </button>

      <span v-if="pageCount" class="text-caption text-muted-foreground">
        {{ pageCount }} pages · layout {{ layoutMs }} ms
      </span>
      <span v-if="error" class="text-caption text-destructive">{{ error }}</span>
    </div>

    <div class="flex-1 min-h-0 overflow-auto rounded-lg border border-border" style="background: #a09a90">
      <div ref="stageRef" class="spike-stage sc-theme theme-onednd2024 p-6" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  buildSpikeContent,
  SPIKE_SCENARIOS,
  type SpikeScenario,
} from "@/lib/scriptorium/spike/spikeContent";
import { usePagedPreview } from "@/composables/usePagedPreview";
import AppSelect from "@/components/common/AppSelect.vue";

/* Served from public/ as a plain URL — Paged.js fetches and parses it itself
   (blob: URLs break its internal relative-URL resolution). */
const SPIKE_PRINT_CSS_URL = "/assets/scriptorium/spike-print.css";

const scenario = ref<SpikeScenario>("full");
const targetPages = ref(30);
const stageRef = ref<HTMLElement | null>(null);

// Drives the real Phase B preview path. Changing scenario/targetPages updates
// the content getter, which the composable re-renders (debounced); Render
// forces it immediately.
const { pageCount, layoutMs, isRendering, error, renderNow } = usePagedPreview({
  content: () => buildSpikeContent(scenario.value, targetPages.value),
  stylesheets: () => [SPIKE_PRINT_CSS_URL],
  container: stageRef,
  debounceMs: 300,
});

function printSpike() {
  window.print();
}

onMounted(renderNow);
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
