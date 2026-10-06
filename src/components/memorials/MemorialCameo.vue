<template>
  <div class="cameo" :style="{ '--cameo-u': `${0.0625 * scale}rem` }" :data-kind="kind">
    <div class="cameo-oval" :class="kind === 'fallen' ? 'cameo-oval-fallen' : 'cameo-oval-retired'">
      <FocalImage
        :src="portraitUrl"
        :alt="`Portrait of ${name}`"
        format="portrait"
        :focal-point="focalPoint"
        :placeholder="placeholderUrl('character')"
        :zoom="2"
        :zoom-anchor-y="0.42"
      />
    </div>
    <MemorialLaurel v-if="kind === 'retired'" />
    <svg v-else viewBox="0 0 200 236" class="cameo-ribbon" aria-hidden="true">
      <path d="M84 214 C90 206 96 206 100 210 C104 206 110 206 116 214 C110 218 104 217 100 213 C96 217 90 218 84 214 Z" fill="#14100c" />
      <path d="M100 212 L92 232 L96 231 L98 234 L100 214 L102 234 L104 231 L108 232 Z" fill="#14100c" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import MemorialLaurel from "@/components/memorials/MemorialLaurel.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { MemorialKind } from "@/types/memorial.types";

/**
 * The oval portrait of a memorial (#982): head and shoulders at 2x, a gilt ring, grisaille
 * and a black ribbon for the fallen, full colour and a laurel for those who retired.
 * `scale` multiplies the whole 200x236 stage so the card and the "mark as fallen" dialog
 * preview draw the same cameo. Colours are the card's fixed mourning palette, not theme
 * tokens (see MemorialCard).
 */
withDefaults(
  defineProps<{
    kind: MemorialKind;
    name: string;
    portraitUrl: string | null;
    focalPoint: { x: number; y: number } | null;
    /** Multiplier on the 200x236 stage. 1 is card size. */
    scale?: number;
  }>(),
  { scale: 1 },
);
</script>

<style scoped>
.cameo {
  --u: var(--cameo-u);
  position: relative;
  flex-shrink: 0;
  width: calc(var(--u) * 200);
  height: calc(var(--u) * 236);
}
.cameo-oval {
  position: absolute;
  left: calc(var(--u) * 30);
  top: calc(var(--u) * 33);
  width: calc(var(--u) * 140);
  height: calc(var(--u) * 176);
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #a8822e;
  box-shadow: 0 0 0 3px #f6f0e3, 0 0 0 4px var(--cameo-ring, #14100c), inset 0 0 18px rgb(0 0 0 / 0.35);
}
.cameo-oval-retired {
  --cameo-ring: #7a5a14;
}
/* On the img through :deep, not on FocalImage: it renders more than one root, so it never
   carries this component's scope attribute and a scoped class on it matches nothing. Not on
   the oval either, which would grey the gilt ring too. */
.cameo-oval-fallen :deep(img) {
  filter: grayscale(1) sepia(0.22) contrast(1.06) brightness(0.97);
}
.cameo-oval-retired :deep(img) {
  filter: sepia(0.12) saturate(0.95);
}
.cameo-ribbon {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
