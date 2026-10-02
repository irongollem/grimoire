<template>
  <span
    ref="flag"
    :class="cn('dg-flag relative inline-block h-5 shrink-0 align-middle', className)"
    role="status"
    aria-label="Loading"
    :style="{ '--n': detail.strips, '--sway': `${(detail.sway * 100).toFixed(1)}%` }"
  >
    <span class="dg-flag__rod" />
    <span class="dg-flag__cloth">
      <span v-for="i in detail.strips" :key="i" class="dg-flag__strip" :style="{ '--i': i - 1 }" />
    </span>
  </span>
</template>

<script setup lang="ts">
/**
 * The bookmark from the logo, rippling in the wind: the app's one loading
 * indicator, at every size. Nothing else spins; `loadingIndicator.test.ts`
 * holds that line.
 *
 * Size it by height (`class="h-4"`); the width follows from the flag's shape.
 * Inside a fixed icon box, give it `h-full` and centre it. Position and display
 * are utilities in the class list, not scoped rules, so a caller can override
 * them: an unlayered scoped rule would beat every utility.
 *
 * CSS only. The cloth is cut into strips that each show the same picture at
 * their own offset; each sways a little further and a little later than the one
 * above (the rod holds the top still), so a wave runs down the cloth. Strips
 * overlap so no seams show. Every length is a percentage of the flag's own box,
 * which is what lets one set of rules draw it at 12px and at 104px.
 *
 * The same markup and CSS are inlined in index.html for the static boot splash;
 * keep the two in step.
 */
import { onMounted, ref, useTemplateRef, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { bannerLoaderDetail } from "./bannerLoaderDetail";

const { class: className } = defineProps<{ class?: HTMLAttributes["class"] }>();

const flag = useTemplateRef<HTMLElement>("flag");
// Cut for the size it turned out to be. Mounted runs before first paint, so the
// full cut it starts from is never seen.
const detail = ref(bannerLoaderDetail(0));
onMounted(() => {
  detail.value = bannerLoaderDetail(flag.value?.offsetHeight ?? 0);
});
</script>

<style scoped>
.dg-flag {
  --period: 1.8s;
  aspect-ratio: 1 / 2.337;
}
.dg-flag__rod {
  position: absolute;
  z-index: 2;
  left: -12.35%;
  top: 0;
  width: 124.7%;
  height: 7.146%;
  background: url("/brand/bookmark-rod.webp") 0 0 / 100% 100% no-repeat;
}
.dg-flag__cloth {
  position: absolute;
  inset: 7.146% 0 0;
}
/* A strip is one nth of the cloth plus 0.6 of a strip of overlap on each side,
   so 2.2 strips tall. The picture is sized back up to the whole cloth and slid
   to where this strip sits in it. */
.dg-flag__strip {
  --t: calc(var(--i) / var(--n));
  position: absolute;
  left: 0;
  width: 100%;
  top: calc((var(--i) - 0.6) * 100% / var(--n));
  height: calc(220% / var(--n));
  background: url("/brand/bookmark-cloth.webp") 0 calc((var(--i) - 0.6) / (var(--n) - 2.2) * 100%) / 100% calc(var(--n) / 2.2 * 100%) no-repeat;
  animation: dg-flag-sway var(--period) ease-in-out infinite;
  animation-delay: calc(var(--period) * var(--t) * -0.9);
}
@keyframes dg-flag-sway {
  0%, 100% {
    transform: translateX(calc(var(--sway) * var(--t) * -1)) scaleX(calc(1 - 0.06 * var(--t)));
    filter: brightness(calc(1 - 0.3 * var(--t)));
  }
  50% {
    transform: translateX(calc(var(--sway) * var(--t))) scaleX(1);
    filter: brightness(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .dg-flag__strip { animation: none; }
}
</style>
