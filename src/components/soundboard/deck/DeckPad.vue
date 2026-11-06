<template>
  <div
    v-if="isVoid"
    aria-hidden="true"
    class="w-full rounded-md bg-muted/60"
    :class="heightClass"
    data-pad-state="void"
  />

  <button
    v-else-if="cell.padId === null && cell.guest === null"
    type="button"
    class="flex w-full items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed text-label text-muted-foreground transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    :class="[
      heightClass,
      dropOver ? 'border-primary bg-primary/10 text-foreground' : 'border-input bg-transparent',
      selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '',
    ]"
    :aria-label="`Empty slot, lane ${cell.lane + 1} row ${cell.row + 1}. Drop a sound here`"
    data-pad-state="empty"
    @click="emit('select')"
  >
    <IconAdd class="h-3 w-3" aria-hidden="true" />
    <span>Drop a sound</span>
  </button>

  <button
    v-else
    ref="el"
    type="button"
    class="relative flex w-full cursor-pointer flex-col justify-between gap-1 overflow-hidden rounded-md border text-start select-none transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [-webkit-touch-callout:none]"
    :class="[heightClass, size === 'sm' ? '@container px-2 py-1.5' : 'px-2.5 py-2', lookClass, touchClass, dropOver ? 'outline-2 outline-primary' : '']"
    :draggable="mode === 'build' && cell.guest === null"
    :data-guest="cell.guest !== null ? '' : undefined"
    :aria-label="padAccessibleName(cell, tool)"
    :data-pad-state="cell.light"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="cancelPress"
    @lostpointercapture="cancelPress"
    @keydown="onKeyDown"
    @keyup="onKeyUp"
    @blur="cancelPress"
    @contextmenu.prevent
    @click="onClick"
    @dragstart="onDragStart"
  >
    <!-- Volume tool: the level rises from the bottom, so the fill is the answer. -->
    <span
      v-if="tool === 'volume'"
      class="pointer-events-none absolute inset-x-0 bottom-0 border-t-2"
      :class="lit ? 'border-current bg-black/15' : levelClass"
      :style="{ height: `${Math.round(cell.volume * 100)}%` }"
      aria-hidden="true"
    />

    <span
      v-if="chip !== null"
      class="pointer-events-none absolute end-1.5 top-1.5 z-10 inline-flex items-center rounded-xs px-1.5 py-0.5 text-2xs font-bold tracking-wider uppercase"
      :class="chip.filled ? 'bg-foreground text-card' : 'border border-input bg-card text-foreground'"
      data-tool-chip
    >
      {{ chip.text }}
    </span>

    <!-- A guest's Keep sits in the top corner (DeckGrid draws it), so its name stops short of it. -->
    <span class="relative flex min-w-0 items-start gap-1.5" :class="cell.guest !== null ? 'pe-5 pointer-coarse:pe-9' : ''">
      <!-- A small pad squeezed narrow keeps its name and lets the icon go: its colour already says the kind. -->
      <component
        :is="kindIcon"
        class="mt-0.5 h-3.5 w-3.5 shrink-0"
        :class="[lit ? '' : PAD_ICON[category], squeezable]"
        aria-hidden="true"
      />
      <span
        class="min-w-0 flex-1 font-semibold leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
        :class="size === 'sm' ? 'text-label-lg' : 'text-body'"
      >
        {{ cell.name }}
      </span>
    </span>

    <span class="relative flex min-w-0 items-center gap-1.5 text-label" :class="blockedText ? 'text-destructive' : footClass">
      <!-- The launch mode is hidden in Simple when it is the default: it is noise until it differs. -->
      <!-- On a squeezed small pad the key number outranks these: the light already says it loops. -->
      <component :is="modeIcon" v-if="showMode" class="h-3 w-3 shrink-0" :class="squeezable" :title="launchModeWords(cell.mode)" aria-hidden="true" />
      <IconRepeat v-if="cell.loop" class="h-3 w-3 shrink-0" :class="[lit ? '' : PAD_ICON[category], squeezable]" aria-hidden="true" />
      <span v-if="lit" class="flex h-2.5 shrink-0 items-end gap-px" aria-hidden="true">
        <span
          v-for="bar in 4"
          :key="bar"
          class="h-full w-0.5 origin-bottom animate-eq rounded-full bg-current motion-reduce:animate-none motion-reduce:scale-y-60"
          :style="{ animationDelay: `${(bar - 1) * 0.17}s` }"
        />
      </span>
      <span class="truncate">{{ blockedText ? cell.blockedReason : cell.meta }}</span>
      <span class="flex-1" />
      <span v-if="cell.takes > 1" class="flex shrink-0 items-center gap-0.5" :title="`${cell.takes} takes`" aria-hidden="true">
        <span
          v-for="take in cell.takes"
          :key="take"
          class="h-1 w-1 rounded-full bg-current"
          :class="take - 1 === cell.nextTake ? 'opacity-100' : 'opacity-40'"
        />
      </span>
      <!-- Every pad gives its top line to the name: the key sits in the bottom corner. -->
      <KeyCap v-if="showKey" class="shrink-0">{{ cell.keyLabel }}</KeyCap>
    </span>

    <span
      v-if="lit && cell.progress > 0"
      class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-black/15"
      aria-hidden="true"
    >
      <span class="block h-full origin-left bg-current opacity-75" :style="{ transform: `scaleX(${cell.progress})` }" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { cn } from "@/lib/utils";
import {
  IconAdd,
  IconLaunchGate,
  IconLaunchRepeat,
  IconLaunchToggle,
  IconLaunchTrigger,
  IconLayers,
  IconLightning,
  IconListOrdered,
  IconMusicNote,
  IconRepeat,
  IconWind,
} from "@/lib/icons";
import KeyCap from "@/components/soundboard/KeyCap.vue";
import { PAD_GLOW, PAD_ICON, PAD_LIT, PAD_REST } from "@/lib/audio/soundCategories";
import type { DeckCellView, DeckControls, DeckTool } from "@/lib/audio/deck/deckSurface";
import type { LaunchMode, SoundCategory } from "@/types/sound.types";
import { isLit, launchModeWords, padAccessibleName, padCategory, toolChipFor } from "./deckPadLook";

/**
 * One pad of the deck (#1136). It draws a `DeckCellView` and reports what the
 * hand did; it never plays anything, the deck controller does. The pad is a
 * bespoke control with its own chrome, which is why it is a raw button.
 * An empty slot while playing is a flat grey cell (keeps the grid a grid); in
 * build mode it is a dashed drop target and a click selects it. No comment
 * sits at the top of the template: it would make the component a fragment.
 *
 * Every press is answered by exactly one release: pointerup, pointercancel and
 * the lostpointercapture the browser fires afterwards all land in `endPress`,
 * which only acts while a press is open. A Gate pad that never heard its
 * release would play forever.
 *
 * A finger is not pressed the moment it lands, because on a phone the same touch
 * may be the start of a scroll through the deck: it is a tap when it lifts where
 * it landed, a hold once it has stayed still for TOUCH_HOLD_MS, and nothing at all
 * once it moves or the browser takes it for a scroll (pointercancel). A mouse,
 * a pen and a key still press at once.
 */

const {
  cell,
  size,
  controls,
  tool,
  mode,
  selected = false,
  dropOver = false,
} = defineProps<{
  cell: DeckCellView;
  /** `sm` is the folded row, `md` the docked deck. */
  size: "sm" | "md";
  controls: DeckControls;
  tool: DeckTool;
  mode: "play" | "build";
  /** Build mode: the pad the editor is open on. */
  selected?: boolean;
  /** Build mode: a pad is being dragged over this slot. */
  dropOver?: boolean;
}>();

const emit = defineEmits<{
  press: [payload: { velocity?: number }];
  release: [];
  padVolume: [value: number];
  select: [];
}>();

const el = ref<HTMLButtonElement | null>(null);

const isVoid = computed(() => cell.padId === null && cell.guest === null && mode === "play");
const category = computed<SoundCategory>(() => padCategory(cell));
const lit = computed(() => isLit(cell));
const chip = computed(() => (mode === "play" && cell.guest === null ? toolChipFor(cell, tool) : null));
const blockedText = computed(() => cell.light === "blocked" && cell.blockedReason !== null);

const heightClass = computed(() => (size === "sm" ? "min-h-15" : "min-h-21"));

/** Gone when a small pad is too narrow for them (the pad is its own container at sm). */
const squeezable = computed(() => (size === "sm" ? "hidden @min-[4rem]:block" : ""));

const showKey = computed(() => cell.keyLabel !== null && chip.value === null && cell.guest === null);

// A vertical drag must not scroll the page under the Volume tool.
const touchClass = computed(() => (tool === "volume" ? "touch-none" : "touch-manipulation"));

// Written out in full for Tailwind's scanner, like the maps in soundCategories.
const FADING: Record<SoundCategory, string> = {
  music: "bg-pad-music/30 border-pad-music",
  ambient: "bg-pad-ambient/30 border-pad-ambient",
  effects: "bg-pad-effects/30 border-pad-effects",
};
const DUCKED: Record<SoundCategory, string> = {
  music: "bg-pad-music/24 border-pad-music/60",
  ambient: "bg-pad-ambient/24 border-pad-ambient/60",
  effects: "bg-pad-effects/24 border-pad-effects/60",
};
const SOLO_RING: Record<SoundCategory, string> = {
  music: "ring-2 ring-pad-music ring-offset-2 ring-offset-background",
  ambient: "ring-2 ring-pad-ambient ring-offset-2 ring-offset-background",
  effects: "ring-2 ring-pad-effects ring-offset-2 ring-offset-background",
};
const LEVEL_FILL: Record<SoundCategory, string> = {
  music: "bg-pad-music/30 border-pad-music",
  ambient: "bg-pad-ambient/30 border-pad-ambient",
  effects: "bg-pad-effects/30 border-pad-effects",
};
const levelClass = computed(() => LEVEL_FILL[category.value]);

const lookClass = computed(() => {
  const cat = category.value;
  const classes: string[] = [];
  switch (cell.light) {
    case "playing":
    case "looping":
    case "held":
      classes.push(PAD_LIT[cat], PAD_GLOW[cat]);
      break;
    case "fading":
      classes.push(FADING[cat]);
      break;
    case "ducked":
      classes.push(DUCKED[cat]);
      break;
    default:
      classes.push(PAD_REST[cat]);
  }
  if (cell.light === "held") classes.push("inset-ring-3 inset-ring-foreground");
  if (cell.light === "blocked") classes.push("opacity-60");
  if (cell.soloed) classes.push(SOLO_RING[cat]);
  if (selected) classes.push("ring-2 ring-primary ring-offset-2 ring-offset-background");
  // A guest is passing through, so it wears the empty slot's dashed edge. In ink, not
  // the category colour: a lit guest's fill is that colour and would swallow it.
  if (cell.guest !== null) return cn(classes, "border-dashed border-current/45");
  return classes;
});

// The foot is quieter than the name; on a lit pad it takes the pad's dark ink.
const footClass = computed(() => (lit.value ? "opacity-85" : "text-muted-foreground"));

const kindIcon = computed(() => {
  if (cell.kind === "scene") return IconLayers;
  if (cell.kind === "playlist") return IconListOrdered;
  if (category.value === "music") return IconMusicNote;
  if (category.value === "ambient") return IconWind;
  return IconLightning;
});

const MODE_ICONS = {
  trigger: IconLaunchTrigger,
  toggle: IconLaunchToggle,
  gate: IconLaunchGate,
  repeat: IconLaunchRepeat,
} as const satisfies Record<LaunchMode, unknown>;
const modeIcon = computed(() => MODE_ICONS[cell.mode]);
const showMode = computed(() => !(controls === "simple" && cell.modeIsDefault));

// ── Press ────────────────────────────────────────────────────────────────

let pressing = false;
let keyHeld = false;

function startPress(): void {
  if (pressing) return;
  pressing = true;
  emit("press", {});
}

/** The one place a release leaves from, whichever event got us here. */
function endPress(): void {
  dragging = false;
  if (!pressing) return;
  pressing = false;
  keyHeld = false;
  emit("release");
}

function levelFromPointer(event: PointerEvent): void {
  const box = el.value?.getBoundingClientRect();
  if (box === undefined || box.height <= 0) return;
  const raw = 1 - (event.clientY - box.top) / box.height;
  const value = Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100;
  if (value !== lastVolume) {
    lastVolume = value;
    emit("padVolume", value);
  }
}
let lastVolume = -1;
let dragging = false;

// ── A finger: a tap, a hold, or a scroll that only started on a pad ─────────

/** A finger that stays down this long without moving is a hold, so Gate and Repeat still work by touch. */
const TOUCH_HOLD_MS = 120;
/** A finger that travels further than this is scrolling, not pressing. */
const TOUCH_SLOP_PX = 10;

let touch: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;

function forgetTouch(): void {
  if (touch === null) return;
  clearTimeout(touch.timer);
  touch = null;
}

/** pointercancel (the browser took the touch for a scroll), a lost capture, a blur: no press, and an open one ends. */
function cancelPress(): void {
  forgetTouch();
  endPress();
}

function onPointerUp(): void {
  // Lifted before it became a hold: a tap, pressed and released at once.
  if (touch !== null) {
    forgetTouch();
    startPress();
  }
  endPress();
}

onBeforeUnmount(forgetTouch);

function onPointerDown(event: PointerEvent): void {
  if (mode === "build" || event.button !== 0) return;
  const target = event.currentTarget;
  if (target instanceof HTMLElement && typeof target.setPointerCapture === "function") {
    target.setPointerCapture(event.pointerId);
  }
  if (tool === "volume") {
    dragging = true;
    lastVolume = -1;
    levelFromPointer(event);
    return;
  }
  if (event.pointerType === "touch") {
    forgetTouch();
    touch = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        touch = null;
        startPress();
      }, TOUCH_HOLD_MS),
    };
    return;
  }
  startPress();
}

function onPointerMove(event: PointerEvent): void {
  if (dragging) levelFromPointer(event);
  if (touch !== null && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > TOUCH_SLOP_PX) forgetTouch();
}

function onClick(): void {
  if (mode === "build") emit("select");
}

function onKeyDown(event: KeyboardEvent): void {
  if (tool === "volume") {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const step = event.key === "ArrowUp" ? 0.05 : -0.05;
      emit("padVolume", Math.round(Math.min(1, Math.max(0, cell.volume + step)) * 100) / 100);
    }
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  // Holding a key auto-repeats keydown; a Gate pad must see one press, not a stutter.
  if (event.repeat || keyHeld) return;
  if (mode === "build") {
    emit("select");
    return;
  }
  keyHeld = true;
  startPress();
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (keyHeld) endPress();
}

function onDragStart(event: DragEvent): void {
  if (mode !== "build" || cell.padId === null || event.dataTransfer === null) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData("application/x-grimoire-pad", cell.padId);
  event.dataTransfer.effectAllowed = "move";
}
</script>
