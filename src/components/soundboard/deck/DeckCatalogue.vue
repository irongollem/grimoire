<template>
  <div class="flex flex-col gap-6">
    <div>
      <p class="mb-2 text-caption text-muted-foreground">Pad states, one per category at rest, then each light</p>
      <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr))">
        <div v-for="item in stateCells" :key="item.label" class="flex flex-col gap-1">
          <DeckPad :cell="item.cell" size="md" controls="full" tool="play" :mode="item.mode ?? 'play'" :selected="item.selected" />
          <span class="text-label text-muted-foreground">{{ item.label }}</span>
        </div>
      </div>
    </div>

    <div>
      <p class="mb-2 text-caption text-muted-foreground">What a press will do: one chip per tool (the Volume level fills from the bottom)</p>
      <div class="flex flex-col gap-2">
        <div v-for="t in chipTools" :key="t" class="flex items-center gap-2">
          <span class="w-14 shrink-0 text-label text-muted-foreground">{{ t }}</span>
          <div class="grid flex-1 grid-cols-4 gap-2">
            <DeckPad v-for="item in chipCells" :key="item.name" :cell="item" size="md" controls="full" :tool="t" mode="play" />
          </div>
        </div>
      </div>
    </div>

    <div>
      <p class="mb-2 text-caption text-muted-foreground">Simple hides a default launch glyph and shows a non-default one; Full shows all. Small size is the folded row.</p>
      <div class="grid max-w-3xl grid-cols-4 gap-2">
        <DeckPad :cell="simpleDefault" size="sm" controls="simple" tool="play" mode="play" />
        <DeckPad :cell="simpleGate" size="sm" controls="simple" tool="play" mode="play" />
        <DeckPad :cell="simpleDefault" size="sm" controls="full" tool="play" mode="play" />
        <DeckPad :cell="simpleGate" size="sm" controls="full" tool="play" mode="play" />
      </div>
    </div>

    <div>
      <p class="mb-2 text-caption text-muted-foreground">The grid with lane headers; the tool strip drives the chips</p>
      <div class="flex gap-3">
        <DeckGrid class="min-w-0 flex-1" :lanes="lanes" :cells="gridCells" :rows="3" size="md" controls="full" :tool="tool" mode="play" />
        <DeckToolStrip class="w-24 shrink-0" :tool="tool" :locked-tool="tool" controls="full" layout="column" :show-keys="true" @tool="onTool" />
        <DeckToolStrip class="w-44 shrink-0 self-start" :tool="tool" :locked-tool="tool" controls="full" layout="grid" :show-keys="true" @tool="onTool" />
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <p class="mb-2 text-caption text-muted-foreground">Phone: four lanes at a time (lanes 5 to 8), tool row beneath</p>
        <div class="flex max-w-sm flex-col gap-2 rounded-md border border-border p-2">
          <DeckGrid :lanes="lanes" :cells="gridCells" :rows="3" :lane-start="4" :lane-count="4" size="sm" controls="simple" :tool="tool" mode="play" />
          <DeckToolStrip :tool="tool" :locked-tool="tool" controls="simple" layout="row" :show-keys="false" @tool="onTool" />
        </div>
      </div>
      <div>
        <p class="mb-2 text-caption text-muted-foreground">Build mode: dashed empty slots, lane headers are buttons</p>
        <DeckGrid :lanes="lanes" :cells="gridCells" :rows="3" :lane-start="0" :lane-count="4" size="sm" controls="full" tool="play" mode="build" selected-pad-id="g-2-1" />
      </div>
    </div>

    <div>
      <p class="mb-2 text-caption text-muted-foreground">Tool strip: row layout, Full</p>
      <DeckToolStrip class="max-w-xl" :tool="tool" :locked-tool="tool" controls="full" layout="row" :show-keys="true" @tool="onTool" />
    </div>

    <div class="flex flex-col gap-2">
      <p class="text-caption text-muted-foreground">Transport, full and compact; Now chips</p>
      <DeckTransport :paused="false" :hush="false" :master-volume="0.8" />
      <DeckTransport :paused="true" :hush="true" :master-volume="0.4" compact />
      <DeckNowChips />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { artUrl } from "@/lib/assets/artUrl";
import DeckGrid from "./DeckGrid.vue";
import DeckNowChips from "./DeckNowChips.vue";
import DeckPad from "./DeckPad.vue";
import DeckToolStrip from "./DeckToolStrip.vue";
import DeckTransport from "./DeckTransport.vue";
import { fixtureCell, fixtureEmpty, fixtureLanes } from "./deckFixtures";
import type { DeckCellView, DeckPhase, DeckTool } from "@/lib/audio/deck/deckSurface";
import type { SoundCategory } from "@/types/sound.types";

/**
 * The deck's look in one place (#1136), drawn from hand-written cells so every
 * state can be checked at /dev/components in any theme without a campaign.
 */

const lanes = fixtureLanes();
const tool = ref<DeckTool>("play");

// A tap locks a tool and a second tap unlocks it; a borrow just follows the finger.
function onTool({ tool: t, phase }: { tool: DeckTool; phase: DeckPhase }): void {
  if (phase === "toggle") tool.value = tool.value === t ? "play" : t;
  else tool.value = phase === "down" ? t : "play";
}

// Any picture in public/ will do: the catalogue only shows how art sits on a pad.
const ART = artUrl("/assets/npcs/mystery-figure.webp");

const CATEGORY_NAMES: Record<SoundCategory, string> = { music: "Tavern theme", ambient: "Rain, light", effects: "Door slam" };
const categories: readonly SoundCategory[] = ["music", "ambient", "effects"];

function pad(category: SoundCategory, over: Partial<DeckCellView> = {}): DeckCellView {
  return fixtureCell({
    category,
    name: CATEGORY_NAMES[category],
    mode: category === "effects" ? "trigger" : "toggle",
    modeIsDefault: true,
    keyLabel: "3",
    ...over,
  });
}

interface StateCell { label: string; cell: DeckCellView; mode?: "play" | "build"; selected?: boolean }

const stateCells: StateCell[] = [
  ...categories.map((c) => ({ label: `${c} at rest`, cell: pad(c, { meta: c === "music" ? "3/12" : null }) })),
  { label: "playing", cell: pad("ambient", { light: "playing", loop: true, progress: 0.4, meta: "Loop" }) },
  { label: "looping music", cell: pad("music", { light: "looping", loop: true, progress: 0.7, meta: "2/8", takes: 3, nextTake: 1 }) },
  { label: "effect playing", cell: pad("effects", { light: "playing", progress: 0.2, takes: 4, nextTake: 2 }) },
  { label: "fading", cell: pad("ambient", { light: "fading", loop: true }) },
  { label: "ducked (another soloed)", cell: pad("music", { light: "ducked" }) },
  { label: "held (gate under a finger)", cell: pad("effects", { light: "held", mode: "gate", modeIsDefault: false }) },
  { label: "blocked", cell: pad("music", { light: "blocked", blockedReason: "Spotify: this device only" }) },
  { label: "soloed", cell: pad("ambient", { light: "playing", soloed: true, loop: true }) },
  { label: "scene", cell: pad("ambient", { kind: "scene", name: "Tavern", count: 3, mode: "toggle" }) },
  { label: "scene playing", cell: pad("ambient", { kind: "scene", name: "Tavern", count: 3, light: "looping", loop: true, mode: "toggle" }) },
  { label: "playlist", cell: pad("music", { kind: "playlist", name: "Exploration", count: 12 }) },
  { label: "playlist playing", cell: pad("music", { kind: "playlist", name: "Exploration", count: 12, meta: "3/12", light: "playing", progress: 0.3 }) },
  { label: "with art", cell: pad("music", { name: "The stranger", art: ART }) },
  { label: "with art, playing", cell: pad("music", { name: "The stranger", art: ART, light: "playing", progress: 0.5 }) },
  { label: "scene with art", cell: pad("ambient", { kind: "scene", name: "Old mill", count: 4, art: ART }) },
  { label: "guest (started by a fight)", cell: pad("music", { padId: null, light: "playing", loop: true, keyLabel: null, meta: "From Goblin ambush", guest: { sourceId: "fight:1", label: "Goblin ambush", target: "playlist-1" } }) },
  { label: "void (play mode)", cell: fixtureEmpty() },
  { label: "empty (build mode)", cell: fixtureEmpty(), mode: "build" as const },
  { label: "selected (build mode)", cell: pad("effects"), mode: "build" as const, selected: true },
];

const chipTools: readonly DeckTool[] = ["loop", "stop", "fade", "solo", "volume", "edit"];
const chipCells: DeckCellView[] = [
  pad("music", { name: "Silent, looping", loop: true }),
  pad("ambient", { name: "Playing", light: "playing", loop: true, volume: 0.55 }),
  pad("effects", { name: "Soloed", light: "playing", soloed: true, volume: 0.9 }),
  pad("effects", { name: "Quiet", volume: 0.2 }),
];

const simpleDefault = pad("effects", { name: "Default mode" });
const simpleGate = pad("effects", { name: "Gate mode", mode: "gate", modeIsDefault: false });

const GRID_LIGHTS: DeckCellView["light"][] = ["ready", "playing", "ready", "fading", "ready", "ducked"];
const gridCells: DeckCellView[] = [];
for (let row = 0; row < 3; row++) {
  for (let lane = 0; lane < 8; lane++) {
    const fill = (lane + row * 3) % 5 !== 4;
    const lanePad = lanes[lane];
    if (!fill || lanePad === undefined) {
      gridCells.push(fixtureEmpty(lane, row));
      continue;
    }
    gridCells.push(
      pad(lanePad.category, {
        lane,
        row,
        padId: `g-${lane}-${row}`,
        name: `${lanePad.name} ${row + 1}`,
        light: GRID_LIGHTS[(lane + row) % GRID_LIGHTS.length] ?? "ready",
        keyLabel: row === 0 ? String(lane + 1) : null,
        loop: lanePad.category !== "effects",
      }),
    );
  }
}
</script>
