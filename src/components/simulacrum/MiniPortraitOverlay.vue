<template>
  <slot v-if="!showMini" />

  <button
    v-if="glbUrl && !showMini"
    type="button"
    class="absolute z-20 inline-flex items-center justify-center rounded-full bg-primary/90 text-primary-foreground p-1.5 shadow-sm hover:opacity-90 transition-opacity"
    :class="badgePositionClasses"
    title="View 3D mini"
    @click.stop="showMini = true"
  >
    <VitruvianIcon class="text-sm" label="View mini" />
  </button>

  <div v-if="mini && glbUrl && showMini" class="absolute inset-0 z-30 flex flex-col bg-black/95" @click.stop>
    <div class="relative flex-1 min-h-0 flex items-center justify-center p-1">
      <MiniModelViewer :src="glbUrl" :poster="mini.thumbnail_url ?? undefined" :alt="mini.label ?? undefined" class="w-full max-h-full" />
      <AiGeneratedBadge variant="chip" :provenance="{ provider: mini.provider, generatedAt: mini.created_at }" />
    </div>
    <div class="flex items-center justify-between gap-1.5 px-2 py-1.5 bg-black/70 shrink-0">
      <div class="flex items-center gap-1.5">
        <a
          :href="glbUrl"
          :download="`${mini.label ?? 'mini'}.glb`"
          title="Download GLB"
          class="inline-flex items-center gap-1 rounded border border-white/20 px-1.5 py-1 text-label text-white/80 hover:text-white hover:border-white/40 transition-colors"
        ><IconDownload class="h-3 w-3" />GLB</a>
        <a
          v-if="stlUrl"
          :href="stlUrl"
          :download="`${mini.label ?? 'mini'}.stl`"
          title="Download STL"
          class="inline-flex items-center gap-1 rounded border border-white/20 px-1.5 py-1 text-label text-white/80 hover:text-white hover:border-white/40 transition-colors"
        ><IconDownload class="h-3 w-3" />STL</a>
      </div>
      <button
        type="button"
        title="Close"
        class="p-1 rounded text-white/70 hover:text-white transition-colors"
        @click="showMini = false"
      ><IconClose class="h-3.5 w-3.5" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import VitruvianIcon from "@/components/common/VitruvianIcon.vue";
import AiGeneratedBadge from "@/components/common/AiGeneratedBadge.vue";
import MiniModelViewer from "@/components/simulacrum/MiniModelViewer.vue";
import { IconClose, IconDownload } from "@/lib/icons";
import { useMiniForSource } from "@/composables/useMiniForSource";
import { getPublicUrl } from "@/lib/storage";
import type { MiniSourceTable } from "@/types/mini.types";

/**
 * Wraps any portrait region: if the wrapped entity has a ready mini, a small
 * Vitruvian badge appears over the portrait; clicking it swaps the wrapped
 * content for a 3D preview + download bar, filling the same container. Zero
 * overhead when no ready mini exists — renders the slot only.
 *
 * The host container must be `relative`-positioned and sized (e.g. an
 * `aspect-3/4` box) — this component fills it via `absolute inset-0` rather
 * than assuming any particular size itself.
 */
const { source, badgePosition = "top-right" } = defineProps<{
  source: { table: MiniSourceTable; id: string };
  badgePosition?: "top-right" | "bottom-right";
}>();

const tableRef = computed(() => source.table);
const idRef = computed(() => source.id);
const { data: mini } = useMiniForSource(tableRef, idRef);

const showMini = ref(false);

// Cache-bust: the glb/stl storage PATH never changes on a base swap, only
// the file contents — so a stale browser/CDN cache would keep serving the
// pre-swap geometry without this.
const glbUrl = computed(() =>
  mini.value?.glb_path ? `${getPublicUrl("miniModels", mini.value.glb_path)}?v=${mini.value.updated_at}` : null,
);
const stlUrl = computed(() =>
  mini.value?.format === "print" && mini.value.stl_path
    ? `${getPublicUrl("miniModels", mini.value.stl_path)}?v=${mini.value.updated_at}`
    : null,
);

const badgePositionClasses = computed(() => (badgePosition === "bottom-right" ? "bottom-2 right-2" : "top-2 right-2"));
</script>
