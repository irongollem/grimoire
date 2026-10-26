<template>
  <!--
    One node in rings (#1084 board 07): the centre, everything one step away with
    the reason on each, and on request the second step, faded. Records draw as
    dashed spokes here, which is how a deity's patron-of PCs and a guild's members
    appear at all. A tap on any node moves the focus there.
  -->
  <svg
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    class="h-full w-full select-none"
    role="group"
    :aria-label="`Everything tied to ${nameOf(focus.center)}`"
  >
    <g>
      <line
        v-for="edge in focus.edges"
        :key="edge.key"
        :x1="posOf(edge.source).x"
        :y1="posOf(edge.source).y"
        :x2="posOf(edge.target).x"
        :y2="posOf(edge.target).y"
        :style="{ stroke: `var(${FAMILY_TOKEN[edge.family]})` }"
        :stroke-width="edge.dashed ? 1.75 : 2.5"
        :stroke-dasharray="edge.dashed ? '6 5' : undefined"
        :opacity="edge.faded ? 0.3 : 0.9"
        stroke-linecap="round"
        :class="isEditableEdge ? 'cursor-pointer' : ''"
        @click="emit('edge', edge.tie)"
      />
    </g>

    <g
      v-for="node in placed"
      :key="node.key"
      :transform="`translate(${node.x} ${node.y})`"
      role="button"
      tabindex="0"
      :aria-label="labelOf(node.key)"
      class="cursor-pointer outline-none focus-visible:[&_.ring]:opacity-100"
      @click="emit('node', node.key)"
      @keydown.enter.prevent="emit('node', node.key)"
      @keydown.space.prevent="emit('node', node.key)"
    >
      <!-- A 44px target whatever the shape's size. -->
      <circle r="22" fill="transparent" />
      <WorldNodeShape
        :kind="kindOf(node.key)"
        :name="nameOf(node.key)"
        :size="sizeOf(node)"
        :fill="fillOf(node.key)"
        :image="imageOf(node.key)"
        :focal-point="focalPoints[node.key]"
        :selected="node.key === connectFrom"
        :faded="node.ring === 2"
        portrait
      />
      <text
        :y="sizeOf(node) + 15"
        text-anchor="middle"
        :font-size="node.ring === 2 ? 10 : 12"
        paint-order="stroke fill"
        stroke-width="3"
        class="stroke-background fill-foreground font-semibold pointer-events-none"
        :opacity="node.ring === 2 ? 0.6 : 1"
      >{{ shorten(nameOf(node.key)) }}</text>
      <text
        v-if="reasonOf(node.key)"
        :y="sizeOf(node) + 29"
        text-anchor="middle"
        font-size="11"
        font-style="italic"
        paint-order="stroke fill"
        stroke-width="3"
        class="stroke-background fill-muted-foreground pointer-events-none"
      >{{ reasonOf(node.key) }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import WorldNodeShape from "@/components/world/WorldNodeShape.vue";
import { FAMILY_TOKEN, nodeSizeFor } from "@/composables/world/useWorldWebGraph";
import { npcRelationshipCanvasColor } from "@/lib/npcDisplay";
import { layoutRings, type FocusGraph, type Placed } from "@/lib/worldWeb/focus";
import { parseNodeKey, type WebKind } from "@/lib/worldWeb/kinds";
import type { WebEntity } from "@/lib/worldWeb/model";
import type { WorldTie } from "@/lib/worldWeb/ties";

const { focus, directory, connectFrom = null, focalPoints = {}, isEditableEdge = false } = defineProps<{
  focus: FocusGraph;
  directory: ReadonlyMap<string, WebEntity>;
  connectFrom?: string | null;
  focalPoints?: Record<string, { x: number; y: number }>;
  /** The DM may tap a line to retype or remove it. */
  isEditableEdge?: boolean;
}>();

const emit = defineEmits<{
  node: [key: string];
  edge: [tie: WorldTie];
}>();

const placed = computed(() => layoutRings(focus));
const positions = computed(() => new Map(placed.value.map((p) => [p.key, p])));

function posOf(key: string): { x: number; y: number } {
  return positions.value.get(key) ?? { x: 0, y: 0 };
}

/** Room for a node's label and reason either side, and its name above and below. */
const viewBox = computed(() => {
  const xs = placed.value.map((p) => p.x);
  const ys = placed.value.map((p) => p.y);
  const minX = Math.min(...xs) - 90;
  const maxX = Math.max(...xs) + 90;
  const minY = Math.min(...ys) - 50;
  const maxY = Math.max(...ys) + 80;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
});

function nameOf(key: string): string {
  return directory.get(key)?.name ?? key;
}
function kindOf(key: string): WebKind {
  return parseNodeKey(key)?.kind ?? "npc";
}
function imageOf(key: string): string | null {
  return directory.get(key)?.image ?? null;
}
function fillOf(key: string): string | undefined {
  const attitude = directory.get(key)?.attitude;
  return attitude ? npcRelationshipCanvasColor(attitude) : undefined;
}
function sizeOf(node: Placed): number {
  const base = nodeSizeFor(kindOf(node.key));
  // The centre is the subject; the second step recedes.
  return node.ring === 0 ? base + 8 : node.ring === 2 ? Math.round(base * 0.72) : base;
}
const reasons = computed(() => new Map(focus.nodes.map((n) => [n.key, n.reasons.join(", ")])));
function reasonOf(key: string): string | undefined {
  return reasons.value.get(key) || undefined;
}
function labelOf(key: string): string {
  const reason = reasonOf(key);
  return reason ? `${nameOf(key)}, ${reason}` : nameOf(key);
}
function shorten(name: string): string {
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}
</script>
