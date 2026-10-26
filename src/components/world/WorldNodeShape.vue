<template>
  <!--
    One shape per kind (#1084 boards 06 and 07), drawn about the origin in screen
    pixels. `scale` is the graph's 1 / zoom, so a node keeps one size however far
    the camera is; in the focus view and the legends it is 1.
  -->
  <g :transform="`scale(${scale})`" :opacity="faded ? 0.45 : 1" class="world-node-shape">
    <circle
      v-if="selected"
      :r="size + 7"
      fill="none"
      stroke="var(--live)"
      stroke-width="2"
      aria-hidden="true"
    />

    <!-- Person: a circle. A PC wears a gold ring and, when it has one, their face. -->
    <template v-if="kind === 'npc' || kind === 'party_member'">
      <circle
        :r="size"
        :style="{ fill: fill ?? 'var(--muted-foreground)' }"
        :stroke="kind === 'party_member' ? 'var(--primary)' : 'var(--border)'"
        :stroke-width="kind === 'party_member' ? 3 : 1.5"
      />
      <!-- At rest an NPC stays a plain circle (hundreds of them); the focus view asks for the portrait. -->
      <foreignObject
        v-if="image && (kind === 'party_member' || portrait)"
        :x="-size"
        :y="-size"
        :width="size * 2"
        :height="size * 2"
        class="pointer-events-none"
      >
        <div class="h-full w-full overflow-hidden rounded-full">
          <FocalImage :src="image" :focal-point="focalPoint" format="token" :alt="name" />
        </div>
      </foreignObject>
    </template>

    <!-- Faction: a shield, carrying the emblem. -->
    <template v-else-if="kind === 'faction'">
      <path :d="shieldPath" style="fill: var(--card)" stroke="var(--foreground)" stroke-width="2" stroke-linejoin="round" />
      <template v-if="image">
        <foreignObject :x="-size" :y="-size * 0.9" :width="size * 2" :height="size * 2" class="pointer-events-none">
          <!-- The emblem fills the shield: the outline is cut out of the picture, not a square set inside it. -->
          <div class="h-full w-full" :style="{ clipPath: `path('${shieldClip}')` }">
            <FocalImage :src="image" :focal-point="focalPoint" format="token" :alt="name" />
          </div>
        </foreignObject>
        <path :d="shieldPath" fill="none" stroke="var(--foreground)" stroke-width="2" stroke-linejoin="round" />
      </template>
      <text v-else text-anchor="middle" dominant-baseline="central" :font-size="size * 0.9" class="fill-muted-foreground font-semibold pointer-events-none">{{ initial }}</text>
    </template>

    <!-- Place: a pin-square. -->
    <template v-else-if="kind === 'location'">
      <path :d="pinPath" style="fill: var(--card)" stroke="var(--link-place)" stroke-width="2.5" stroke-linejoin="round" />
      <text text-anchor="middle" dominant-baseline="central" :y="-size * 0.12" :font-size="size * 0.9" class="fill-muted-foreground font-semibold pointer-events-none">{{ initial }}</text>
    </template>

    <!-- Deity: a ringed disc. -->
    <template v-else-if="kind === 'deity'">
      <circle :r="size" style="fill: var(--card)" stroke="var(--link-faith)" stroke-width="2.5" />
      <foreignObject
        v-if="image"
        :x="-size * 0.68"
        :y="-size * 0.68"
        :width="size * 1.36"
        :height="size * 1.36"
        class="pointer-events-none"
      >
        <div class="h-full w-full overflow-hidden rounded-full">
          <FocalImage :src="image" :focal-point="focalPoint" format="token" :alt="name" />
        </div>
      </foreignObject>
      <circle :r="size * 0.68" fill="none" stroke="var(--link-faith)" stroke-width="1.25" />
      <text v-if="!image" text-anchor="middle" dominant-baseline="central" :font-size="size * 0.8" class="fill-muted-foreground font-semibold pointer-events-none">{{ initial }}</text>
    </template>

    <!-- Item: a diamond, smaller than the rest. -->
    <template v-else-if="kind === 'item'">
      <path :d="diamondPath" style="fill: var(--card)" stroke="var(--link-holding)" stroke-width="2.5" stroke-linejoin="round" />
    </template>

    <!-- Quest: a seal. -->
    <template v-else>
      <path :d="sealPath" style="fill: var(--card)" stroke="var(--live)" stroke-width="2" stroke-linejoin="round" />
      <circle :r="size * 0.5" fill="none" stroke="var(--live)" stroke-width="1" />
    </template>
  </g>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import type { WebKind } from "@/lib/worldWeb/kinds";

const { kind, name, size = 18, scale = 1, fill, image = null, focalPoint, selected = false, faded = false, portrait = false } = defineProps<{
  kind: WebKind;
  name: string;
  /** Radius in screen pixels. */
  size?: number;
  scale?: number;
  /** A person's fill: the NPC's attitude to the party. */
  fill?: string;
  image?: string | null;
  focalPoint?: { x: number; y: number };
  selected?: boolean;
  faded?: boolean;
  /** Draw an NPC's portrait too (the focus view); at rest in the whole web an NPC is a plain circle. */
  portrait?: boolean;
}>();

const initial = computed(() => name.trim().charAt(0).toUpperCase() || "?");

const shieldPath = computed(() => {
  const r = size;
  return `M ${-r} ${-r * 0.9} L ${r} ${-r * 0.9} L ${r} ${r * 0.1} Q ${r} ${r * 0.85} 0 ${r * 1.1} Q ${-r} ${r * 0.85} ${-r} ${r * 0.1} Z`;
});

/** The shield outline again in the coordinates of its bounding box (the emblem's container), for a CSS clip. */
const shieldClip = computed(() => {
  const r = size;
  const x = (v: number) => (v + r).toFixed(2);
  const y = (v: number) => (v + r * 0.9).toFixed(2);
  return `M ${x(-r)} ${y(-r * 0.9)} L ${x(r)} ${y(-r * 0.9)} L ${x(r)} ${y(r * 0.1)} Q ${x(r)} ${y(r * 0.85)} ${x(0)} ${y(r * 1.1)} Q ${x(-r)} ${y(r * 0.85)} ${x(-r)} ${y(r * 0.1)} Z`;
});

const pinPath = computed(() => {
  const r = size * 0.9;
  return `M ${-r} ${-r} L ${r} ${-r} L ${r} ${r * 0.6} L ${r * 0.3} ${r * 0.6} L 0 ${r * 1.15} L ${-r * 0.3} ${r * 0.6} L ${-r} ${r * 0.6} Z`;
});

const diamondPath = computed(() => {
  const r = size * 0.85;
  return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
});

const sealPath = computed(() => {
  const points: string[] = [];
  const teeth = 12;
  for (let i = 0; i < teeth * 2; i++) {
    const angle = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? size : size * 0.84;
    points.push(`${(Math.cos(angle) * r).toFixed(2)} ${(Math.sin(angle) * r).toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
});
</script>
