<template>
  <!--
    One dish and the material in it. Layers back to front: the dish's contact line, the dish,
    the material's contact line, the material, then the dish's front lip over the material's base.
    Grounding is the two contact lines and nothing else; an ellipse, halo or cast shadow reads as
    the object floating, and the maintainer rejected every version of them.
  -->
  <div class="wb-dish relative" :style="{ width: 'var(--dish-w)', aspectRatio: `1 / ${geo.aspect}` }" aria-hidden="true">
    <img
      :src="dishSrc"
      alt=""
      draggable="false"
      decoding="async"
      class="wb-layer wb-dish-contact"
      :style="{ transform: `translateY(${dishDrop}%)` }"
    />
    <img :src="dishSrc" alt="" draggable="false" decoding="async" class="wb-layer" />

    <!--
      The material, and its contact line with it, as one group so that whatever the outcome does
      to the material takes the line along. A spent material is drawn only while it is leaving.
    -->
    <div v-for="layer in layers" :key="layer.key" class="absolute inset-0" :class="layer.cls" :style="{ '--wb-i': order }">
      <img
        v-if="state !== 'missing'"
        :src="layer.src"
        alt=""
        draggable="false"
        decoding="async"
        class="wb-sprite wb-sprite-contact"
        :style="{
          ...layer.box,
          opacity: layer.geo.contact.opacity,
          transform: `translateY(${layer.geo.contact.dropPct}%)`,
          filter: `brightness(0) blur(calc(var(--dish-w) * 0.44 * ${layer.geo.contact.blurOfSpriteWidth}))`,
        }"
      />
      <img
        :src="layer.src"
        alt=""
        draggable="false"
        decoding="async"
        class="wb-sprite"
        :class="{ 'wb-sprite-missing': state === 'missing' }"
        :style="{ ...layer.box, filter: state === 'missing' ? undefined : (layer.filter ?? undefined) }"
      />
    </div>

    <!-- A missing material is only outlined: the dish opening shows where it belongs. -->
    <span v-if="state === 'missing'" class="wb-opening" :style="openingBox" />

    <img
      :src="dishSrc"
      alt=""
      draggable="false"
      decoding="async"
      class="wb-layer wb-rim"
      :style="{ '--rim-mask': geo.rimMask }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { WORKBENCH_NEUTRAL_SPRITE, WORKBENCH_RUINED_SPRITE, WORKBENCH_SPRITES, type WorkbenchDish, type WorkbenchSprite } from "@/data/workbenchArt";
import { spriteSrc as spriteUrl } from "@/lib/crafting/workbench/art";
import type { MaterialExit } from "@/lib/crafting/workbench/slotMaterial";
import { dishContactDropPct, slotGeometry } from "@/lib/crafting/workbench/slotGeometry";

export type DishState = "ready" | "missing" | "spent" | "ruined";

const { dishSrc, dish, spriteSrc, sprite, filter, state, exit = null, order = 0 } = defineProps<{
  dishSrc: string;
  dish: WorkbenchDish;
  /** The material's picture; null when nothing is drawn (spent, or no material). */
  spriteSrc: string | null;
  sprite: WorkbenchSprite | null;
  /** The material's tint, as a CSS filter. */
  filter: string | null;
  state: DishState;
  /** How the material leaves once the roll is in; null before it. */
  exit?: MaterialExit | null;
  /** The dish's place in the stagger, 0-based. */
  order?: number;
}>();

interface Layer {
  key: string;
  src: string;
  filter: string | null;
  cls: string | null;
  geo: ReturnType<typeof slotGeometry>;
  box: Record<string, string>;
}

// The sprite's box depends on its own proportions, so each layer carries the geometry of what it shows.
function layerFor(key: string, src: string, s: WorkbenchSprite, tint: string | null, cls: string | null): Layer {
  const geo = slotGeometry(dish, s);
  const box = {
    left: `${geo.sprite.left}%`,
    top: `${geo.sprite.top}%`,
    width: `${geo.sprite.width}%`,
    height: `${geo.sprite.height}%`,
  };
  return { key, src, filter: tint, cls, geo, box };
}

// What is drawn, back to front. The spent material stays in the tree only while it plays its
// exit; the primary dish of a critical failure then shows the wreckage that is returned.
const layers = computed<Layer[]>(() => {
  const out: Layer[] = [];
  const own = spriteSrc && sprite ? { src: spriteSrc, sprite } : null;
  if (state === "ruined") {
    if (exit && own) out.push(layerFor("material", own.src, own.sprite, filter, `wb-exit wb-exit-${exit}`));
    const ruined = WORKBENCH_SPRITES[WORKBENCH_RUINED_SPRITE];
    out.push(layerFor("ruined", spriteUrl(ruined.id), ruined, null, exit ? "wb-ruin-in" : null));
  } else if (state === "spent") {
    if (exit && own) out.push(layerFor("material", own.src, own.sprite, filter, `wb-exit wb-exit-${exit}`));
  } else if (own) {
    out.push(layerFor("material", own.src, own.sprite, filter, null));
  }
  return out;
});

// Aspect and rim depend on the dish alone; the sprite argument only places a material.
const geo = computed(() => slotGeometry(dish, WORKBENCH_SPRITES[WORKBENCH_NEUTRAL_SPRITE]));
const dishDrop = computed(() => dishContactDropPct(dish));

const openingBox = computed(() => {
  const o = dish.opening;
  return {
    left: `${(o.cx - o.rx) * 100}%`,
    top: `${(o.cy - o.ry) * 100}%`,
    width: `${o.rx * 200}%`,
    height: `${o.ry * 200}%`,
  };
});
</script>

<style scoped>
.wb-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  user-select: none;
  pointer-events: none;
}
.wb-sprite {
  position: absolute;
  user-select: none;
  pointer-events: none;
}
.wb-dish-contact {
  filter: brightness(0) blur(calc(var(--dish-w) * 0.01));
  opacity: 0.85;
}
.wb-sprite-missing {
  opacity: 0.3;
  filter: grayscale(1) brightness(1.4);
}
.wb-opening {
  position: absolute;
  border: 2px dashed currentColor;
  border-radius: 50%;
  opacity: 0.55;
  pointer-events: none;
}
.wb-rim {
  mask-image: var(--rim-mask);
  -webkit-mask-image: var(--rim-mask);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}

/* Reduced motion shows the end state at once: a spent material is simply gone, the wreckage in place. */
.wb-exit {
  opacity: 0;
}
@media (prefers-reduced-motion: no-preference) {
  .wb-exit {
    animation-duration: var(--wb-dur);
    animation-delay: calc(var(--wb-i) * 90ms);
    animation-fill-mode: both;
    animation-timing-function: ease-in;
  }
  .wb-exit-made {
    --wb-dur: 700ms;
    animation-name: wb-made;
  }
  .wb-exit-destroyed {
    --wb-dur: 1100ms;
    animation-name: wb-destroyed;
  }
  .wb-ruin-in {
    animation: wb-ruin-in 300ms ease-out 800ms both;
  }
}
@keyframes wb-made {
  from {
    opacity: 1;
    transform: none;
  }
  to {
    opacity: 0;
    transform: translateY(-35%) scale(0.85);
  }
}
@keyframes wb-destroyed {
  from {
    opacity: 1;
    transform: none;
    filter: none;
  }
  30% {
    opacity: 1;
    filter: sepia(0.8) brightness(0.35) contrast(1.4);
    transform: translateX(-2%);
  }
  42% {
    transform: translateX(2%);
  }
  54% {
    transform: translateX(-2%);
  }
  66% {
    opacity: 1;
    transform: translateX(1%);
  }
  to {
    opacity: 0;
    transform: scale(0.8) translateY(10%);
    filter: sepia(0.8) brightness(0.35) contrast(1.4);
  }
}
@keyframes wb-ruin-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
