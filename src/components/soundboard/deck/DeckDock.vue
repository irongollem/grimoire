<template>
  <section
    ref="root"
    aria-label="Sound deck"
    data-testid="deck-dock"
    :data-size="size"
    class="border-border bg-card"
    :class="size === 'full' ? 'absolute inset-0 z-30 flex flex-col' : 'relative shrink-0 border-t'"
  >
    <!-- Nothing built yet: one quiet line that leads to the builder. -->
    <RouterLink
      v-if="empty"
      to="/soundboard"
      class="flex h-6 items-center justify-center gap-2 text-label font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <IconMusic class="h-3 w-3" aria-hidden="true" />
      Build your deck
    </RouterLink>

    <template v-else>
      <!-- The top edge is the doorbell: rest the pointer here and the deck peeks open. -->
      <div
        v-if="size === 'row'"
        class="absolute inset-x-0 -top-1.5 z-10 h-3"
        data-testid="deck-edge"
        @pointerenter="peek.edgeEnter()"
        @pointerleave="peek.edgeLeave()"
      />

      <button
        v-if="size === 'tucked'"
        type="button"
        class="flex h-6 w-full items-center justify-center gap-2 text-label font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        :aria-label="`Open the deck${playing > 0 ? `, ${playing} playing` : ''}`"
        data-testid="deck-handle"
        @click="ui.deckSize = 'row'"
        @pointerenter="peek.edgeEnter()"
        @pointerleave="peek.edgeLeave()"
      >
        <span class="flex gap-1" aria-hidden="true">
          <span
            v-for="(light, index) in lights"
            :key="index"
            class="h-1.5 w-1.5 rounded-full"
            :class="LIGHT[light]"
          />
        </span>
        <span>{{ playing > 0 ? `${playing} playing` : "Deck" }}</span>
        <IconChevronUp class="h-3 w-3" aria-hidden="true" />
      </button>

      <!-- Scrolling the bar steps through the page's rows, one at a time. -->
      <div v-else-if="size === 'row'" class="flex h-19 items-center gap-3 px-3" @wheel="onRowWheel">
        <AppButton
          variant="outline"
          size="sm"
          class="max-w-36 shrink-0 pointer-coarse:min-h-11"
          :label="pageName"
          :icon-right="IconChevronRight"
          :tooltip="`${pageName}: next page`"
          :disabled="snapshot.pages.length < 2"
          @click="deck.dispatch({ type: 'pageStep', delta: 1 })"
        />
        <!-- One row of small pads: the lane headers belong to the full deck. -->
        <DeckGrid
          class="min-w-0 flex-1"
          headers="hidden"
          :lanes="snapshot.lanes"
          :cells="snapshot.cells"
          :rows="1"
          :row-start="shownRow"
          size="sm"
          :controls="ui.deckControls"
          :tool="snapshot.tool"
          mode="play"
          @press="(p) => deck.dispatch({ type: 'press', ...p })"
          @release="(p) => deck.dispatch({ type: 'release', ...p })"
          @keep="(p) => deck.dispatch({ type: 'keep', ...p })"
          @pad-volume="(p) => deck.dispatch({ type: 'padVolume', ...p })"
        />
        <!-- The same steps as the scroll, as buttons: no gesture is the only way in. -->
        <div v-if="snapshot.rows > 1" class="flex shrink-0 flex-col items-center" data-testid="deck-row-steps">
          <AppButton
            variant="ghost"
            size="icon-2xs"
            :icon="IconChevronUp"
            aria-label="Previous row"
            tooltip="Previous row (or scroll up)"
            :disabled="shownRow === 0"
            data-testid="deck-row-up"
            @click="stepRow(-1)"
          />
          <span class="text-caption tabular-nums text-muted-foreground" aria-live="polite">{{ shownRow + 1 }}/{{ snapshot.rows }}</span>
          <AppButton
            variant="ghost"
            size="icon-2xs"
            :icon="IconChevronDown"
            aria-label="Next row"
            tooltip="Next row (or scroll down)"
            :disabled="shownRow === snapshot.rows - 1"
            data-testid="deck-row-down"
            @click="stepRow(1)"
          />
        </div>
        <DeckTransport
          class="shrink-0"
          compact
          :paused="snapshot.paused"
          :hush="snapshot.hush"
          :master-volume="snapshot.masterVolume"
          @pause-all="deck.dispatch({ type: 'pauseAll' })"
          @fade-all="deck.dispatch({ type: 'fadeAll' })"
          @hush="({ phase }) => deck.dispatch({ type: 'hush', phase })"
          @master="(value) => deck.dispatch({ type: 'master', value })"
        />
        <div class="flex shrink-0 items-center gap-1.5">
          <DeckSizeControl :model-value="size" @update:model-value="setSize" />
          <DeckSettingsPopover />
        </div>
      </div>

      <template v-else>
        <div class="flex flex-col gap-3 px-4 pt-2.5 pb-3.5" :class="size === 'full' ? 'min-h-0 flex-1' : ''">
          <DeckHeader :size="size" @update:size="setSize" />
          <DeckDockBody :fill="size === 'full'" />
        </div>
      </template>

      <!-- Peek: Deck size laid over the page. It pushes nothing, so the page never jumps. -->
      <Transition v-bind="peekTransition">
        <div
          v-if="peek.peeking.value"
          class="absolute inset-x-3 bottom-full z-30 mb-1 rounded-md border border-primary/60 bg-card p-3 shadow-xl"
          data-slip
          data-testid="deck-peek"
          @pointerenter="peek.hold()"
          @pointerleave="peek.release()"
          @pointerdown="peek.hold()"
        >
          <DeckDockBody />
        </div>
      </Transition>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useDeck } from "@/composables/soundboard/useDeck";
import { useDeckPeek } from "@/composables/soundboard/useDeckPeek";
import { useDockBottom } from "@/composables/soundboard/useDockBottom";
import { useHotkeys } from "@/composables/useHotkeys";
import { IconChevronDown, IconChevronRight, IconChevronUp, IconMusic } from "@/lib/icons";
import { createWheelStep, wheelPixels } from "@/lib/audio/deck/wheelStep";
import { prefersReducedMotion } from "@/lib/motion";
import type { DeckLight, DeckSize } from "@/lib/audio/deck/deckSurface";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import { storeToRefs } from "pinia";
import DeckDockBody from "./DeckDockBody.vue";
import DeckGrid from "./DeckGrid.vue";
import DeckHeader from "./DeckHeader.vue";
import DeckSettingsPopover from "./DeckSettingsPopover.vue";
import DeckSizeControl from "./DeckSizeControl.vue";
import DeckTransport from "./DeckTransport.vue";

/**
 * The deck docked under every DM page (#1136). In the page's flow, so it pushes
 * the page up and never covers it, except Full (a deliberate overlay) and the
 * peek. Its current height is published as `--dock-bottom`.
 */

const { empty = false } = defineProps<{
  /** The campaign has no pads yet. */
  empty?: boolean;
}>();

const deck = useDeck();
const snapshot = deck.snapshot;
const ui = useSoundboardUiStore();
const { deckSize: size, deckPeekEnabled, deckPeekSignal } = storeToRefs(ui);

const peek = useDeckPeek({ size, enabled: deckPeekEnabled, signal: deckPeekSignal });

function setSize(next: DeckSize): void {
  ui.deckSize = next;
}

// ── The one-row bar: which row it shows ───────────────────────────────────
// The deck's row in view, the same one keys 1 to 8 fire: the deck keeps it on
// the page and starts another page at its top row, and a peek opens on it.
const shownRow = computed(() => snapshot.value.keyRow);

function stepRow(delta: number): void {
  const row = Math.min(Math.max(0, shownRow.value + delta), Math.max(0, snapshot.value.rows - 1));
  if (row !== shownRow.value) deck.dispatch({ type: "showRow", row });
}

const wheelStep = createWheelStep(() => performance.now());
function onRowWheel(event: WheelEvent): void {
  // One row: nothing to step through, so the page keeps the scroll.
  if (snapshot.value.rows < 2) return;
  event.preventDefault();
  const direction = wheelStep(wheelPixels(event));
  if (direction !== 0) stepRow(direction);
}

const pageName = computed(() => snapshot.value.pages[snapshot.value.pageIndex]?.name ?? "Pages");
const playing = computed(() => snapshot.value.audibleCount);

// Up to four dots for what is lit now: the handle's whole job in a thin strip.
const lights = computed(() => {
  const lit = snapshot.value.cells.filter((cell) => cell.light === "playing" || cell.light === "looping" || cell.light === "fading");
  return lit.slice(0, 4).map((cell) => cell.light);
});
const LIGHT: Partial<Record<DeckLight, string>> = {
  playing: "bg-primary",
  looping: "bg-primary",
  fading: "bg-muted-foreground",
};

// Full covers the page, so it takes nothing from the bottom edge.
const root = useTemplateRef<HTMLElement>("root");
useDockBottom(root, computed(() => size.value !== "full"));

useHotkeys(
  [{ combo: "escape", description: "Close the full-screen deck", hidden: true, handler: () => setSize("deck") }],
  { layer: "overlay", enabled: () => size.value === "full" },
);

const peekTransition = computed(() =>
  prefersReducedMotion()
    ? {}
    : {
        enterActiveClass: "transition duration-200 ease-out",
        enterFromClass: "translate-y-2 opacity-0",
        leaveActiveClass: "transition duration-150 ease-in",
        leaveToClass: "translate-y-2 opacity-0",
      },
);
</script>
