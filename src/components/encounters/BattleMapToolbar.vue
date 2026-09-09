<template>
  <div class="map-topbar">
    <!-- Header (frame 13): "<focus room> — <encounter>" over a status line,
         with Site/Encounter as a segmented control rather than a one-off
         back link — Encounter is always the selected option here, since
         picking Site is what navigates away. -->
    <div class="topbar-header">
      <div class="topbar-heading">
        <h1 class="topbar-title">{{ title }}</h1>
        <p class="topbar-caption">{{ caption }}</p>
      </div>
      <ManualHelpLink page="encounter-map-battle-map-fog-of-war" />
      <SegmentedControl
        model-value="encounter"
        :options="siteEncounterOptions"
        variant="outline"
        size="xs"
        @update:model-value="onSiteEncounterChange"
      />
    </div>

    <div class="topbar-controls">
      <!-- Layer bar: what's on the map and why it needed no setup of its own
           (frame 13 — "Calibration came with the publish, nothing to align"). -->
      <div class="layer-bar">
        <span class="layer-chip">Tokens {{ tokenCount }}</span>
        <AppCheckbox
          v-model="showZones"
          label="Zones"
          label-class="fog-label"
          class="inline-flex items-center gap-1"
        />
        <span class="layer-chip">Grid 5 ft</span>
        <span v-if="calibrationFromPublish" class="layer-caption">
          Calibration came with the publish — nothing to align
        </span>
      </div>

      <!-- Fog toolbox -->
      <div class="fog-toolbox">
        <span class="fog-label">Fog</span>
        <div class="tool-group" role="radiogroup" aria-label="Tool">
          <AppButton
            v-for="t in TOOLS"
            :key="t.id"
            variant="ghost"
            fill="muted"
            size="xs"
            :icon="t.icon"
            :active="tool === t.id"
            :tooltip="t.label"
            @click="tool = t.id"
          />
        </div>
        <template v-if="tool !== 'pan'">
          <div class="tool-group" role="radiogroup" aria-label="Brush shape">
            <AppButton
              v-for="s in BRUSH_SHAPES"
              :key="s.id"
              variant="ghost"
              fill="muted"
              size="xs"
              :icon="s.icon"
              :active="brushShape === s.id"
              :tooltip="s.label"
              @click="brushShape = s.id"
            />
          </div>
          <div class="tool-group" role="radiogroup" aria-label="Brush size">
            <AppButton
              v-for="n in BRUSH_SIZES"
              :key="n"
              variant="ghost"
              fill="muted"
              size="xs"
              :active="brushSize === n"
              :tooltip="`${n} cells`"
              @click="brushSize = n"
            >
              {{ n }}
            </AppButton>
          </div>
        </template>
        <AppButton
          variant="outline"
          size="xs"
          :icon="IconReveal"
          label="Reveal all"
          tooltip="Reveal everything (clear fog)"
          @click="$emit('resetFog', 'reveal')"
        />
        <AppButton
          variant="outline"
          size="xs"
          :icon="IconHide"
          label="Hide all"
          tooltip="Re-hide everything (reset fog)"
          @click="$emit('resetFog', 'hide')"
        />
        <AppCheckbox
          v-model="previewAsPlayer"
          label="As player"
          label-class="fog-label"
          class="inline-flex items-center gap-1"
        />
      </div>

      <div class="topbar-right">
        <span class="hint">{{ scalePercent }}%</span>
        <AppButton
          variant="outline"
          size="xs"
          :icon="IconReset"
          label="Reset"
          tooltip="Reset view"
          @click="$emit('resetView')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import { useRouter, type RouteLocationRaw } from "vue-router";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import {
  IconHand,
  IconReveal,
  IconHide,
  IconCircle,
  IconStop,
  IconReset,
  IconNavAtlas,
  IconEncounter,
} from "@/lib/icons";

export type BattleMapTool = "pan" | "reveal" | "rehide";
export type BattleMapBrushShape = "round" | "cell";
type SiteEncounterValue = "site" | "encounter";

const props = defineProps<{
  /** "<focus room name> — <encounter name>", or just the encounter name when
   *  the battle map isn't anchored to a room on a site (frame 13 header). */
  title: string;
  /** "Encounter running · round N · M combatants", or "Encounter ready"
   *  before go-live. */
  caption: string;
  /** Where the Site option of the segmented control below navigates —
   *  the same target the old back link used. */
  siteTarget: RouteLocationRaw;
  siteTooltip: string;
  tokenCount: number;
  calibrationFromPublish: boolean;
  scalePercent: number;
}>();

defineEmits<{
  resetFog: [mode: "reveal" | "hide"];
  resetView: [];
}>();

const tool = defineModel<BattleMapTool>("tool", { required: true });
const brushShape = defineModel<BattleMapBrushShape>("brushShape", { required: true });
const brushSize = defineModel<1 | 3 | 5>("brushSize", { required: true });
const showZones = defineModel<boolean>("showZones", { required: true });
const previewAsPlayer = defineModel<boolean>("previewAsPlayer", { required: true });

const router = useRouter();

const siteEncounterOptions = computed(() => [
  { value: "site" as SiteEncounterValue, label: "Site", icon: IconNavAtlas, tooltip: props.siteTooltip },
  { value: "encounter" as SiteEncounterValue, label: "Encounter", icon: IconEncounter },
]);

function onSiteEncounterChange(value: SiteEncounterValue) {
  if (value === "site") router.push(props.siteTarget);
}

const TOOLS: { id: BattleMapTool; label: string; icon: Component }[] = [
  { id: "pan", label: "Pan map", icon: IconHand },
  { id: "reveal", label: "Reveal brush", icon: IconReveal },
  { id: "rehide", label: "Re-hide brush", icon: IconHide },
];
// IconStop is lucide's plain Square glyph (re-exported for a "stop" affordance
// elsewhere in the app) — reused here for the cell brush's square shape rather
// than adding a second export of the same icon.
const BRUSH_SHAPES: { id: BattleMapBrushShape; label: string; icon: Component }[] = [
  { id: "round", label: "Round brush", icon: IconCircle },
  { id: "cell", label: "Cell brush", icon: IconStop },
];
const BRUSH_SIZES = [1, 3, 5] as const;
</script>

<style scoped>
.map-topbar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.4);
}

.topbar-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.topbar-heading {
  flex: 1;
  min-width: 0;
}

.topbar-title {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-weight: 700;
  font-size: 0.875rem;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-caption {
  font-family: var(--font-fell, "IM Fell English", serif);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

.topbar-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

.hint {
  font-family: var(--font-fell, "IM Fell English", serif);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

.layer-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.layer-chip {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
  padding: 0.125rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.25rem;
  color: rgba(255, 255, 255, 0.7);
}
.layer-caption {
  font-family: var(--font-fell, "IM Fell English", serif);
  font-size: 0.75rem;
  font-style: italic;
  color: rgba(255, 255, 255, 0.45);
}

.fog-toolbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.fog-label {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.55);
}
.tool-group {
  display: inline-flex;
  gap: 0.125rem;
}
</style>
