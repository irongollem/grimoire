<template>
  <div class="flex flex-col items-center gap-2">
    <!-- The armed tool's own options, above it. Move has none. -->
    <div
      v-if="tool !== 'move'"
      data-slip
      data-testid="play-tool-options"
      class="flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-md border border-border bg-popover px-2 py-1.5 shadow-lg"
    >
      <template v-if="tool === 'fog'">
        <SegmentedControl v-model="fogKind" :options="FOG_KINDS" variant="outline" size="xs" aria-label="Fog brush" />
        <template v-if="fogKind !== 'room'">
          <SegmentedControl v-model="shape" :options="SHAPES" variant="outline" size="xs" icon-only aria-label="Brush shape" />
          <SegmentedControl v-model="size" :options="SIZES" variant="outline" size="xs" aria-label="Brush size" />
        </template>
        <span v-else class="text-caption text-muted-foreground">Click a room to reveal all of it</span>
        <AppButton variant="outline" size="xs" :icon="IconReveal" label="Reveal all" @click="emit('reveal-all')" />
        <AppButton variant="outline" size="xs" :icon="IconHide" label="Hide all" @click="emit('hide-all')" />
        <AppButton
          variant="tinted"
          tone="primary"
          :emphasis="asPlayer ? 'strong' : 'outline'"
          size="xs"
          :icon="IconScan"
          label="As players see it"
          :aria-pressed="asPlayer"
          @click="emit('toggle-as-player')"
        />
      </template>
      <template v-else-if="tool === 'darkness'">
        <span class="text-caption text-muted-foreground">Click to place, click a sphere to remove it</span>
        <SegmentedControl v-model="radius" :options="RADII" variant="outline" size="xs" aria-label="Darkness radius" />
      </template>
      <template v-else-if="tool === 'measure'">
        <span class="text-caption text-muted-foreground">Drag from anywhere. Click to bend it round a pillar. Esc lets go. Players see the line while it is there.</span>
      </template>
      <template v-else-if="tool === 'area'">
        <SegmentedControl v-model="areaShape" :options="AREA_SHAPES" variant="outline" size="xs" aria-label="Area shape" />
        <label class="flex items-center gap-1 text-caption text-muted-foreground">
          <AppInput v-model.number="areaFeet" type="number" min="5" step="5" inputmode="numeric" tone="filled" size="sm" align="center" :block="false" class="w-16" aria-label="Size in feet" />
          ft
        </label>
        <span v-if="areaReadout" class="text-label-lg font-semibold text-tone-danger" data-testid="area-readout">{{ areaReadout }}</span>
        <AppInput
          v-model.number="amount"
          type="number"
          min="1"
          inputmode="numeric"
          tone="filled"
          size="sm"
          align="center"
          :block="false"
          class="w-20"
          placeholder="Damage"
          aria-label="Damage amount"
          @keydown.enter="damageAll"
        />
        <AppButton
          variant="tinted"
          tone="danger"
          emphasis="outline"
          size="xs"
          :label="`Damage all ${selectedCount}`"
          :disabled="selectedCount === 0 || amount === null || amount <= 0"
          @click="damageAll"
        />
        <p class="basis-full text-center text-caption text-muted-foreground">Creatures inside are picked for you. You still roll their saves your way.</p>
      </template>
      <template v-else-if="tool === 'ping'">
        <span class="text-caption text-muted-foreground">Click or hold anywhere. Everyone sees a ripple with your name.</span>
      </template>
      <template v-else-if="tool === 'draw'">
        <AppButton variant="tinted" tone="primary" :emphasis="drawPinned ? 'strong' : 'outline'" size="xs" :icon="IconPin" label="Pin drawings" :aria-pressed="drawPinned" @click="drawPinned = !drawPinned" />
        <AppButton variant="outline" size="xs" :icon="IconEraser" label="Clear drawings" @click="emit('clear-drawings')" />
        <span class="text-caption text-muted-foreground">Strokes fade when the turn ends unless pinned.</span>
      </template>
    </div>

    <div
      role="toolbar"
      aria-label="Map tools"
      data-slip
      class="flex items-stretch gap-1 rounded-lg border border-border bg-card p-1 shadow-md"
    >
      <AppButton
        v-for="t in shown"
        :key="t.id"
        variant="tool"
        size="tile"
        icon-size="lg"
        :icon="t.icon"
        :active="tool === t.id"
        :aria-pressed="tool === t.id"
        :aria-label="t.label"
        :tooltip="`${t.label} (${t.key.toUpperCase()})`"
        @click="tool = t.id"
      >
        <span class="leading-none">{{ t.label }}</span>
        <KeyCap corner>{{ t.key.toUpperCase() }}</KeyCap>
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import KeyCap from "@/components/common/controls/KeyCap.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import {
  IconAreaOfEffect,
  IconCircle,
  IconDraw,
  IconEraser,
  IconScan,
  IconHand,
  IconHide,
  IconMoon,
  IconPin,
  IconPing,
  IconReveal,
  IconRuler,
  IconStop,
} from "@/lib/icons";
import {
  PLAY_TOOL_KEYS,
  type AreaShape,
  type BrushShape,
  type BrushSize,
  type DarknessRadius,
  type FogBrushKind,
  type PlayTool,
} from "./playTypes";

/**
 * The Play toolbelt (#1125 frame 11): Move, Measure, Area, Fog, Darkness, Ping and Draw, each with its own options slip
 * above it. The keys it names are bound by the map that mounts it. The explore screen's map has only the tools that make
 * sense walking a site, so `tools` can narrow the belt.
 */
const { tools = null, asPlayer = false, areaReadout = null, selectedCount = 0 } = defineProps<{
  /** The tools to show, in belt order; all seven when omitted. */
  tools?: readonly PlayTool[] | null;
  /** Fog's "As players see it" is on. */
  asPlayer?: boolean;
  /** "10 ft · 3 inside" for the area being placed. */
  areaReadout?: string | null;
  /** How many creatures are selected: the ones Damage all hits. */
  selectedCount?: number;
}>();
const tool = defineModel<PlayTool>("tool", { required: true });
const fogKind = defineModel<FogBrushKind>("fogKind", { default: "reveal" });
const shape = defineModel<BrushShape>("shape", { default: "round" });
const size = defineModel<BrushSize>("size", { default: 3 });
const radius = defineModel<DarknessRadius>("radius", { default: 15 });
const areaShape = defineModel<AreaShape>("areaShape", { default: "sphere" });
const areaFeet = defineModel<number>("areaFeet", { default: 20 });
const drawPinned = defineModel<boolean>("drawPinned", { default: false });
const emit = defineEmits<{
  "reveal-all": [];
  "hide-all": [];
  "toggle-as-player": [];
  "damage-all": [amount: number];
  "clear-drawings": [];
}>();

/** The amount typed for Damage all; the same plain number box the runner's sheet uses. */
const amount = ref<number | null>(null);
function damageAll() {
  const n = amount.value;
  if (n !== null && n > 0 && selectedCount > 0) emit("damage-all", n);
}

const TOOLS: { id: PlayTool; label: string; icon: Component }[] = [
  { id: "move", label: "Move", icon: IconHand },
  { id: "measure", label: "Measure", icon: IconRuler },
  { id: "area", label: "Area", icon: IconAreaOfEffect },
  { id: "fog", label: "Fog", icon: IconReveal },
  { id: "darkness", label: "Darkness", icon: IconMoon },
  { id: "ping", label: "Ping", icon: IconPing },
  { id: "draw", label: "Draw", icon: IconDraw },
];
const shown = computed(() =>
  TOOLS.filter((t) => tools === null || tools.includes(t.id)).map((t) => ({ ...t, key: PLAY_TOOL_KEYS[t.id] })),
);
const FOG_KINDS: { value: FogBrushKind; label: string }[] = [
  { value: "room", label: "Room" },
  { value: "reveal", label: "Brush" },
  { value: "hide", label: "Hide" },
];
const SHAPES: { value: BrushShape; label: string; icon: Component }[] = [
  { value: "round", label: "Round brush", icon: IconCircle },
  { value: "cell", label: "Square brush", icon: IconStop },
];
const SIZES: { value: BrushSize; label: string }[] = [
  { value: 1, label: "1" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
];
const RADII: { value: DarknessRadius; label: string }[] = [
  { value: 10, label: "10 ft" },
  { value: 15, label: "15 ft" },
  { value: 20, label: "20 ft" },
  { value: 30, label: "30 ft" },
];
const AREA_SHAPES: { value: AreaShape; label: string }[] = [
  { value: "sphere", label: "Sphere" },
  { value: "cone", label: "Cone" },
  { value: "line", label: "Line" },
  { value: "cube", label: "Cube" },
];
</script>
