<template>
  <svg
    viewBox="0 0 200 200"
    class="block w-full max-w-45 mx-auto select-none touch-manipulation"
    role="radiogroup"
    aria-label="NPC reaction toward the party"
  >
    <g
      v-for="(opt, i) in WEDGES"
      :key="opt.value"
      class="wedge-group"
      :transform="hovered === i ? `translate(${liftX(i)} ${liftY(i)})` : ''"
      @mouseenter="hovered = i"
      @mouseleave="hovered = null"
    >
      <title>{{ opt.label }}</title>
      <path
        :d="wedgePath(i)"
        :fill="modelValue === opt.value ? opt.color : opt.color + '28'"
        stroke="var(--color-card)"
        stroke-width="4"
        class="wedge-path cursor-pointer transition-[fill] duration-150"
        role="radio"
        tabindex="0"
        :aria-label="opt.label"
        :aria-checked="modelValue === opt.value"
        @click="select(opt.value)"
        @keydown.enter.prevent="select(opt.value)"
        @keydown.space.prevent="select(opt.value)"
      />
      <text
        :x="labelX(i)"
        :y="labelY(i)"
        text-anchor="middle"
        dominant-baseline="central"
        class="pointer-events-none font-cinzel font-semibold"
        :style="{
          fontSize: '8px',
          fill: modelValue === opt.value ? '#fff' : opt.color,
        }"
      >{{ opt.label }}</text>
    </g>

    <!-- Center disk — tap to reset to Unknown -->
    <title>Unknown — clear stance</title>
    <circle
      cx="100" cy="100" r="32"
      :fill="modelValue === 'unknown' ? UNKNOWN_COLOR + '33' : 'var(--color-card)'"
      stroke="var(--color-card)"
      stroke-width="4"
      class="center-circle cursor-pointer transition-[fill] duration-150"
      role="radio"
      tabindex="0"
      aria-label="Unknown"
      :aria-checked="modelValue === 'unknown'"
      @click="select('unknown')"
      @keydown.enter.prevent="select('unknown')"
      @keydown.space.prevent="select('unknown')"
    />
    <text
      x="100" y="100"
      text-anchor="middle"
      dominant-baseline="central"
      class="pointer-events-none font-cinzel font-bold"
      :style="{
        fontSize: '20px',
        fill: UNKNOWN_COLOR,
        opacity: modelValue === 'unknown' ? '1' : '0.4',
      }"
    >?</text>
  </svg>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  NPC_RELATIONSHIP_COLORS,
  NPC_RELATIONSHIP_LABELS,
  type NpcRelationship,
} from '@/types/npc.types'

defineProps<{ modelValue: NpcRelationship }>()
const emit = defineEmits<{ 'update:modelValue': [value: NpcRelationship] }>()

type Wedge = Exclude<NpcRelationship, 'unknown'>
const WEDGES: { value: Wedge; label: string; color: string }[] = [
  { value: 'indifferent', label: NPC_RELATIONSHIP_LABELS.indifferent, color: NPC_RELATIONSHIP_COLORS.indifferent },
  { value: 'friendly',    label: NPC_RELATIONSHIP_LABELS.friendly,    color: NPC_RELATIONSHIP_COLORS.friendly },
  { value: 'helpful',     label: NPC_RELATIONSHIP_LABELS.helpful,     color: NPC_RELATIONSHIP_COLORS.helpful },
  { value: 'hostile',     label: NPC_RELATIONSHIP_LABELS.hostile,     color: NPC_RELATIONSHIP_COLORS.hostile },
  { value: 'unfriendly',  label: NPC_RELATIONSHIP_LABELS.unfriendly,  color: NPC_RELATIONSHIP_COLORS.unfriendly },
]
const UNKNOWN_COLOR = NPC_RELATIONSHIP_COLORS.unknown

const CX = 100
const CY = 100
const OUTER_R = 90
const INNER_R = 34
const LABEL_R = 62
const LIFT = 5
const SLICE = (2 * Math.PI) / WEDGES.length
const OFFSET = -Math.PI / 2 - SLICE / 2

const hovered = ref<number | null>(null)

function midAngle(i: number) {
  return OFFSET + i * SLICE + SLICE / 2
}
function liftX(i: number): string { return (Math.cos(midAngle(i)) * LIFT).toFixed(2) }
function liftY(i: number): string { return (Math.sin(midAngle(i)) * LIFT).toFixed(2) }

function pt(angle: number, r: number) {
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) }
}

function wedgePath(i: number): string {
  const a1 = OFFSET + i * SLICE
  const a2 = a1 + SLICE
  const o1 = pt(a1, OUTER_R), o2 = pt(a2, OUTER_R)
  const i1 = pt(a1, INNER_R), i2 = pt(a2, INNER_R)
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 0 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 0 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function labelX(i: number) { return pt(midAngle(i), LABEL_R).x }
function labelY(i: number) { return pt(midAngle(i), LABEL_R).y }

function select(value: NpcRelationship) { emit('update:modelValue', value) }
</script>

<style scoped>
/* Smooth lift animation on hover; will-change composites each wedge
   independently so the center ? text doesn't jitter during transitions */
.wedge-group {
  transition: transform 150ms ease-out;
  will-change: transform;
}
/* Suppress browser focus ring for pointer — keep it for keyboard navigation */
.wedge-path:focus:not(:focus-visible),
.center-circle:focus:not(:focus-visible) {
  outline: none;
}
</style>
