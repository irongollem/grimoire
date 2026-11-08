<template>
  <section
    ref="root"
    aria-label="Sound deck"
    data-testid="deck-phone"
    :data-size="shown"
    class="fixed inset-x-0 z-55 border-border bg-card"
    :class="open
      ? 'bottom-0 flex flex-col rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] shadow-2xl'
      : 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))] border-t'"
    :style="open ? { height: shown === 'full' ? '100dvh' : '70dvh' } : undefined"
  >
    <!-- Nothing built yet. -->
    <RouterLink
      v-if="empty"
      to="/soundboard"
      class="flex h-11 items-center justify-center gap-2 text-label font-semibold text-muted-foreground"
    >
      <IconMusic class="h-3.5 w-3.5" aria-hidden="true" />
      Build your deck
    </RouterLink>

    <template v-else>
      <!-- The grabber: tap to open, drag to resize. -->
      <button
        type="button"
        class="flex w-full shrink-0 touch-none items-center justify-center gap-2 text-label font-semibold text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        :class="folded ? 'h-7' : 'h-8'"
        :aria-label="open ? 'Deck size: drag to resize' : `Open the deck${playing > 0 ? `, ${playing} playing` : ''}`"
        data-testid="deck-grabber"
        @pointerdown="onGrabStart"
        @pointerup="onGrabEnd"
        @pointercancel="grabY = null"
      >
        <span class="h-1 w-9 rounded-full bg-border" aria-hidden="true" />
        <span v-if="shown === 'tucked'">{{ playing > 0 ? `${playing} playing` : "Deck" }}</span>
      </button>

      <!-- Folded: four pads and Hush, only while there is a reason to have them to hand. -->
      <div v-if="shown === 'row'" class="flex items-stretch gap-2 px-3 pb-2">
        <DeckGrid
          class="min-w-0 flex-1"
          headers="hidden"
          :lanes="snapshot.lanes"
          :cells="snapshot.cells"
          :rows="1"
          :lane-start="0"
          :lane-count="4"
          size="sm"
          :controls="ui.deckControls"
          :tool="snapshot.tool"
          mode="play"
          @press="(p) => deck.dispatch({ type: 'press', ...p })"
          @release="(p) => deck.dispatch({ type: 'release', ...p })"
          @keep="(p) => deck.dispatch({ type: 'keep', ...p })"
          @pad-volume="(p) => deck.dispatch({ type: 'padVolume', ...p })"
        />
        <AppButton
          variant="outline"
          size="sm"
          class="min-h-11 shrink-0 self-stretch"
          :active="snapshot.hush"
          :icon="IconHush"
          label="Hush"
          tooltip="Everything drops to a murmur while you talk"
          :aria-pressed="snapshot.hush"
          @pointerdown="hushGesture.begin()"
          @pointerup="hushGesture.end()"
          @pointercancel="hushGesture.end()"
          @pointerleave="hushGesture.end()"
          @contextmenu.prevent
          @click="hushGesture.onClick($event)"
        />
      </div>

      <!-- Open: the whole deck, four lanes at a time. -->
      <template v-else-if="open">
        <div class="flex shrink-0 items-center gap-1 px-3 pb-1">
          <div class="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="Pages">
            <AppButton
              v-for="(page, index) in snapshot.pages"
              :key="page.id"
              variant="ghost"
              size="sm"
              role="tab"
              class="min-h-11 shrink-0"
              :active="index === snapshot.pageIndex"
              :aria-selected="index === snapshot.pageIndex"
              :label="page.name"
              @click="deck.dispatch({ type: 'page', index })"
            />
          </div>
          <DeckSettingsPopover />
          <AppButton
            variant="ghost"
            size="icon-sm"
            class="size-11"
            :icon="IconChevronDown"
            aria-label="Fold the deck"
            tooltip="Fold the deck"
            @click="ui.deckSize = 'row'"
          />
        </div>

        <div class="shrink-0 overflow-x-auto px-3 pb-2"><DeckNowChips /></div>

        <div
          v-if="snapshot.lockedTool !== 'play'"
          class="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-md border border-primary/60 bg-primary/10 py-1 ps-3 pe-1 text-label font-semibold"
          role="status"
          data-testid="deck-lock-banner"
        >
          <span class="min-w-0 flex-1 truncate">{{ lockText }}</span>
          <AppButton
            variant="outline"
            size="sm"
            class="min-h-11"
            label="Done"
            @click="deck.dispatch({ type: 'tool', tool: snapshot.lockedTool, phase: 'toggle' })"
          />
        </div>

        <!-- Two windows of four lanes; the browser does the swiping, so a drag never fires a pad twice. -->
        <div
          ref="pager"
          class="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          data-testid="deck-pager"
          @scroll.passive="onPagerScroll"
        >
          <div
            v-for="start in WINDOWS"
            :key="start"
            class="min-h-0 w-full shrink-0 snap-start overflow-y-auto overscroll-contain px-3"
            :data-lane-start="start"
          >
            <DeckGrid
              headers="sticky"
              :lanes="snapshot.lanes"
              :cells="snapshot.cells"
              :rows="snapshot.rows"
              :lane-start="start"
              :lane-count="LANES_PER_WINDOW"
              size="sm"
              :controls="ui.deckControls"
              :tool="snapshot.tool"
              mode="play"
              @press="(p) => deck.dispatch({ type: 'press', ...p })"
              @release="(p) => deck.dispatch({ type: 'release', ...p })"
              @keep="(p) => deck.dispatch({ type: 'keep', ...p })"
              @pad-volume="(p) => deck.dispatch({ type: 'padVolume', ...p })"
            />
          </div>
        </div>

        <div class="flex shrink-0 items-center justify-between gap-2 px-3 text-caption text-muted-foreground">
          <span>{{ pagerText }}</span>
          <div class="flex items-center">
          <button
            v-for="start in WINDOWS"
            :key="start"
            type="button"
            class="size-11 grid place-items-center focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="`Lanes ${start + 1} to ${start + LANES_PER_WINDOW}`"
            :aria-current="windowStart === start"
            @click="goToWindow(start)"
          >
            <span class="h-1.5 rounded-full transition-all" :class="windowStart === start ? 'w-5 bg-primary' : 'w-1.5 bg-border'" />
          </button>
          </div>
        </div>

        <div class="shrink-0 px-3 pb-2">
          <DeckToolStrip
            :tool="snapshot.tool"
            :locked-tool="snapshot.lockedTool"
            :controls="ui.deckControls"
            layout="row"
            :show-keys="false"
            @tool="(p) => deck.dispatch({ type: 'tool', ...p })"
          />
        </div>

        <div class="shrink-0 px-3 pb-3">
          <DeckTransport
            :paused="snapshot.paused"
            :hush="snapshot.hush"
            :master-volume="snapshot.masterVolume"
            @pause-all="deck.dispatch({ type: 'pauseAll' })"
            @fade-all="deck.dispatch({ type: 'fadeAll' })"
            @hush="({ phase }) => deck.dispatch({ type: 'hush', phase })"
            @master="(value) => deck.dispatch({ type: 'master', value })"
          />
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef } from "vue";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useDeck } from "@/composables/soundboard/useDeck";
import { useDeckPeek } from "@/composables/soundboard/useDeckPeek";
import { useDockBottom } from "@/composables/soundboard/useDockBottom";
import { IconChevronDown, IconHush, IconMusic } from "@/lib/icons";
import { prefersReducedMotion } from "@/lib/motion";
import { DECK_SIZES, type DeckSize, type DeckTool } from "@/lib/audio/deck/deckSurface";
import { useAppUiStore } from "@/stores/ui/app";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import DeckGrid from "./DeckGrid.vue";
import DeckNowChips from "./DeckNowChips.vue";
import DeckSettingsPopover from "./DeckSettingsPopover.vue";
import DeckToolStrip from "./DeckToolStrip.vue";
import DeckTransport from "./DeckTransport.vue";
import { createTapOrHold } from "./tapOrHold";

/**
 * The deck on a phone (#1136). Folded it is four pads and Hush above the bottom
 * bar (only while a session runs or something plays, otherwise a slim handle);
 * open it is a bottom sheet with four lanes at a time. Its folded height is
 * published as `--dock-bottom`; an open sheet covers the page and publishes none.
 */

const { empty = false } = defineProps<{ empty?: boolean }>();

const deck = useDeck();
const snapshot = deck.snapshot;
const ui = useSoundboardUiStore();
const app = useAppUiStore();
const { deckSize: size, deckPeekEnabled, deckPeekSignal } = storeToRefs(ui);

const LANES_PER_WINDOW = 4;
const WINDOWS = [0, 4] as const;

const peek = useDeckPeek({ size, enabled: deckPeekEnabled, signal: deckPeekSignal });
const playing = computed(() => snapshot.value.audibleCount);

// A peek on a phone is the folded row, shown over a tucked handle for a moment.
const shown = computed<DeckSize>(() => {
  const wanted = size.value === "tucked" && peek.peeking.value ? "row" : size.value;
  if (wanted !== "row") return wanted;
  return app.dmMode === "play" || playing.value > 0 ? "row" : "tucked";
});
const open = computed(() => !empty && (shown.value === "deck" || shown.value === "full"));
const folded = computed(() => !open.value);

const root = useTemplateRef<HTMLElement>("root");
useDockBottom(root, folded);

const hushGesture = createTapOrHold((phase) => deck.dispatch({ type: "hush", phase }));
onBeforeUnmount(() => hushGesture.dispose());

// ── Grabber ──────────────────────────────────────────────────────────────
const DRAG_PX = 40;
let grabY: number | null = null;

function onGrabStart(event: PointerEvent): void {
  grabY = event.clientY;
  // Keep the drag even when the finger leaves the strip.
  if (event.currentTarget instanceof HTMLElement && typeof event.currentTarget.setPointerCapture === "function") {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
}

function step(delta: -1 | 1): void {
  const index = DECK_SIZES.indexOf(size.value) + delta;
  const next = DECK_SIZES[Math.max(0, Math.min(DECK_SIZES.length - 1, index))];
  if (next !== undefined) ui.deckSize = next;
}

function onGrabEnd(event: PointerEvent): void {
  if (grabY === null) return;
  const dy = event.clientY - grabY;
  grabY = null;
  if (Math.abs(dy) < DRAG_PX) {
    // A tap opens a folded deck to the sheet, and folds an open one.
    if (open.value) ui.deckSize = "row";
    else ui.deckSize = "deck";
    return;
  }
  if (dy < 0 && size.value === "tucked" && deckPeekEnabled.value) peek.open();
  else step(dy < 0 ? 1 : -1);
}

// ── Lane windows ─────────────────────────────────────────────────────────
const pager = useTemplateRef<HTMLElement>("pager");
const windowStart = ref(0);

function onPagerScroll(): void {
  const el = pager.value;
  if (el === null || el.clientWidth === 0) return;
  windowStart.value = el.scrollLeft > el.clientWidth / 2 ? LANES_PER_WINDOW : 0;
}

function goToWindow(start: number): void {
  const el = pager.value;
  if (el === null) return;
  el.scrollTo({ left: start === 0 ? 0 : el.clientWidth, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

const pagerText = computed(() =>
  windowStart.value === 0 ? "Lanes 1 to 4, swipe for 5 to 8" : "Lanes 5 to 8, swipe for 1 to 4",
);

// ── A locked tool ─────────────────────────────────────────────────────────
const LOCK_WORDS: Record<DeckTool, string> = {
  play: "Play",
  loop: "Loop: tap a pad to switch it",
  stop: "Stop: tap a pad to stop it",
  fade: "Fade: tap a pad to fade it out",
  solo: "Solo: tap a pad to solo it",
  volume: "Volume: drag a pad to set its level",
  edit: "Edit: tap a pad to open it",
};
const lockText = computed(() => LOCK_WORDS[snapshot.value.lockedTool]);
</script>
