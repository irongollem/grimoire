<template>
  <div class="flex flex-col items-center gap-2">
    <!-- The armed tool's own options, above it. Move has none. -->
    <div
      v-if="tool !== 'move'"
      data-slip
      data-testid="play-tool-options"
      class="flex flex-wrap items-center justify-center gap-2 rounded-md border border-border bg-popover px-2 py-1.5 shadow-lg"
    >
      <template v-if="tool === 'fog'">
        <SegmentedControl v-model="fogKind" :options="FOG_KINDS" variant="outline" size="xs" aria-label="Fog brush" />
        <SegmentedControl v-model="shape" :options="SHAPES" variant="outline" size="xs" icon-only aria-label="Brush shape" />
        <SegmentedControl v-model="size" :options="SIZES" variant="outline" size="xs" aria-label="Brush size" />
        <AppButton variant="outline" size="xs" :icon="IconReveal" label="Reveal all" @click="emit('reveal-all')" />
        <AppButton variant="outline" size="xs" :icon="IconHide" label="Hide all" @click="emit('hide-all')" />
      </template>
      <template v-else>
        <span class="text-caption text-muted-foreground">Click to place, click a sphere to remove it</span>
        <SegmentedControl v-model="radius" :options="RADII" variant="outline" size="xs" aria-label="Darkness radius" />
      </template>
    </div>

    <div
      role="toolbar"
      aria-label="Map tools"
      data-slip
      class="flex items-stretch gap-1 rounded-lg border border-border bg-card p-1 shadow-md"
    >
      <AppButton
        v-for="t in TOOLS"
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
import type { Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import KeyCap from "@/components/common/controls/KeyCap.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { IconCircle, IconHand, IconHide, IconMoon, IconReveal, IconStop } from "@/lib/icons";
import { PLAY_TOOL_KEYS, type BrushShape, type BrushSize, type DarknessRadius, type FogBrushKind, type PlayTool } from "./playTypes";

/**
 * The Play toolbelt (#1125 frame 10): the three tools the fight needs on the map. Measure, Area,
 * Ping and Draw join the belt in a later story. The keys it names are bound by PlayMap.
 */
const tool = defineModel<PlayTool>("tool", { required: true });
const fogKind = defineModel<FogBrushKind>("fogKind", { required: true });
const shape = defineModel<BrushShape>("shape", { required: true });
const size = defineModel<BrushSize>("size", { required: true });
const radius = defineModel<DarknessRadius>("radius", { required: true });
const emit = defineEmits<{ "reveal-all": []; "hide-all": [] }>();

const TOOLS: { id: PlayTool; label: string; key: string; icon: Component }[] = [
  { id: "move", label: "Move", key: PLAY_TOOL_KEYS.move, icon: IconHand },
  { id: "fog", label: "Fog", key: PLAY_TOOL_KEYS.fog, icon: IconReveal },
  { id: "darkness", label: "Darkness", key: PLAY_TOOL_KEYS.darkness, icon: IconMoon },
];
const FOG_KINDS: { value: FogBrushKind; label: string }[] = [
  { value: "reveal", label: "Reveal" },
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
</script>
