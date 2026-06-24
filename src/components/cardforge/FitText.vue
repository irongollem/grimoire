<template>
  <div ref="host" class="ft-host">
    <div
      v-for="(e, i) in entries"
      v-show="measuring || i < visibleCount || i === partialIndex"
      :key="e.key ?? i"
      class="ft-entry"
      :class="{ 'ft-clamped': !measuring && i === partialIndex }"
      :style="
        !measuring && i === partialIndex
          ? { '-webkit-line-clamp': String(clampLines) }
          : undefined
      "
    >
      <span v-if="e.name" class="ft-name">{{ e.name }}</span
      ><template v-for="(tok, ti) in entryTokens(e)" :key="ti"><DamageIcon
          v-if="'type' in tok"
          :type="tok.type"
          class="ft-dmg"
        /><template v-else>{{ tok.text }}</template></template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { computeFit, type FitChild } from "@/lib/fitText";
import { tokenizeDamage, type DamageToken } from "@/lib/damageIcons";
import DamageIcon from "@/components/common/DamageIcon.vue";

/** One entry — an optional bold lead-in name plus its body text. */
export interface FitEntry {
  name?: string;
  text: string;
  key?: string | number;
}

const { entries } = defineProps<{ entries: FitEntry[] }>();

/** Body text split into runs + damage-type icons (with a leading space after the name). */
function entryTokens(e: FitEntry): DamageToken[] {
  return tokenizeDamage(e.name ? " " + e.text : e.text);
}

const host = ref<HTMLElement | null>(null);
/** While measuring we render every entry in full so we can read its geometry. */
const measuring = ref(true);
const visibleCount = ref(entries.length);
const partialIndex = ref(-1);
const clampLines = ref(0);

function lineHeightOf(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight);
  return Number.isNaN(lh) ? parseFloat(cs.fontSize) * 1.2 : lh;
}

async function fit() {
  const el = host.value;
  if (!el) return;
  // Render all entries full, then read their measured positions.
  measuring.value = true;
  await nextTick();
  const kids = Array.from(el.children) as HTMLElement[];
  const children: FitChild[] = kids.map((k) => ({
    top: k.offsetTop,
    height: k.offsetHeight,
    lineHeight: lineHeightOf(k),
  }));
  const result = computeFit(children, el.clientHeight);
  visibleCount.value = result.visibleCount;
  partialIndex.value = result.partialIndex;
  clampLines.value = result.clampLines;
  measuring.value = false;
}

let ro: ResizeObserver | null = null;

onMounted(() => {
  ro = new ResizeObserver(() => fit());
  if (host.value) ro.observe(host.value);
  // Web fonts change metrics — re-fit once they're ready.
  void fit();
  document.fonts?.ready.then(() => fit());
});

onBeforeUnmount(() => ro?.disconnect());

watch(
  () => entries,
  () => fit(),
  { deep: true },
);
</script>

<style scoped>
.ft-host {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* consumers set gap / typography via :deep(.ft-host) and :deep(.ft-entry) */
}
.ft-clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ft-dmg {
  font-size: 1.05em;
  vertical-align: -0.14em;
}
</style>
