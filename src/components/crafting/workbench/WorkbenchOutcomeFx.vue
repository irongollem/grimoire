<template>
  <!--
    The bench's reaction to the roll, laid over the apparatus band of the scene picture or the
    phone banner. The plates were painted on black and are drawn with `screen`, never cut out.
    Every layer rests at its final opacity; the keyframes only exist for people who allow motion.
  -->
  <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" :data-outcome="outcome" :data-layer="layer">
    <!-- Behind the dishes: what happens at the apparatus, and the bench going cold. The cold stays,
         so it must never cover the plaques. -->
    <template v-if="layer !== 'front'">
      <template v-if="outcome === 'success'">
        <div class="fx-flare absolute inset-x-0 top-0 h-1/2" />
        <img :src="sparks" alt="" draggable="false" class="fx-plate fx-sparks" />
      </template>
      <div v-else-if="outcome === 'fail'" class="fx-cold absolute inset-0" />
      <div v-else-if="outcome === 'ruin'" class="fx-cold fx-cold-deep absolute inset-0" />
    </template>

    <!-- In front of the dishes: a critical failure's flash, embers and smoke come out of the dishes
         themselves. All of it fades to nothing, so nothing is left over the plaques. -->
    <template v-if="layer !== 'back' && outcome === 'ruin'">
      <div class="fx-flash absolute inset-0" />
      <img :src="sparks" alt="" draggable="false" class="fx-plate fx-sparks fx-ember" :class="{ 'fx-from-dishes': layer === 'front' }" />
      <img :src="steam" alt="" draggable="false" class="fx-plate fx-steam" :class="{ 'fx-from-dishes': layer === 'front' }" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { WORKBENCH_FX } from "@/data/workbenchArt";
import { fxSrc } from "@/lib/crafting/workbench/art";
import type { CraftingAttemptResult } from "@/types/crafting.types";

const { outcome, layer = "all" } = defineProps<{
  outcome: CraftingAttemptResult["outcome"];
  /** The scene draws the effects twice, behind and in front of its dishes; the phone banner has no dishes, so "all". */
  layer?: "back" | "front" | "all";
}>();

const sparks = fxSrc(WORKBENCH_FX.sparks);
const steam = fxSrc(WORKBENCH_FX.steam);
</script>

<style scoped>
.fx-flare {
  background: radial-gradient(ellipse 55% 70% at 50% 45%, rgb(255 190 90 / 0.75), transparent 70%);
  opacity: 0.35;
}
.fx-cold {
  background: rgb(18 24 32 / 0.45);
}
.fx-cold-deep {
  background: rgb(18 24 32 / 0.55);
}
.fx-flash {
  background: rgb(150 30 10 / 0.45);
  opacity: 0;
}
.fx-plate {
  position: absolute;
  left: 50%;
  top: 38%;
  height: 90%;
  aspect-ratio: 1;
  max-width: none;
  mix-blend-mode: screen;
  opacity: 0;
  transform: translate(-50%, -50%);
}
.fx-steam.fx-from-dishes {
  top: 58%;
}
.fx-ember {
  filter: hue-rotate(-20deg) saturate(1.6);
}
.fx-from-dishes {
  top: 62%;
}
.fx-steam {
  top: 52%;
  height: 80%;
  filter: grayscale(1);
}

@media (prefers-reduced-motion: no-preference) {
  .fx-flare {
    animation: fx-flare 1.4s ease-out both;
  }
  .fx-cold {
    animation: fx-fade-in 600ms ease-out both;
  }
  .fx-cold-deep {
    animation-delay: 300ms;
  }
  .fx-flash {
    animation: fx-flash 400ms ease-out both;
  }
  .fx-sparks {
    animation: fx-burst 1.1s ease-out both;
  }
  .fx-steam {
    animation: fx-smoke 1.6s ease-out 200ms both;
  }
}
@keyframes fx-flare {
  from {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  to {
    opacity: 0.35;
  }
}
@keyframes fx-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes fx-flash {
  from {
    opacity: 0;
  }
  35% {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes fx-burst {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.6);
  }
  40% {
    opacity: 1;
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.15);
  }
}
@keyframes fx-smoke {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) translateY(0);
  }
  35% {
    opacity: 0.5;
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) translateY(-60%);
  }
}
</style>
