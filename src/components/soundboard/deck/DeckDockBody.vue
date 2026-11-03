<template>
  <div class="flex min-h-0 gap-3" :class="fill ? 'flex-1' : ''">
    <!-- Lane headers stay put while the rows scroll; the mask says "more below" instead of cutting a pad mid-way. -->
    <div
      ref="scroller"
      class="deck-scroll min-w-0 flex-1 overflow-y-auto overscroll-contain"
      :class="[fill ? '' : 'max-h-58', clipped ? 'deck-fade' : '']"
      data-testid="deck-scroll"
      @scroll="onScroll"
    >
      <DeckGrid
        headers="sticky"
        :lanes="snapshot.lanes"
        :cells="snapshot.cells"
        :rows="snapshot.rows"
        size="md"
        :controls="ui.deckControls"
        :tool="snapshot.tool"
        mode="play"
        @press="(p) => deck.dispatch({ type: 'press', ...p })"
        @release="(p) => deck.dispatch({ type: 'release', ...p })"
        @keep="(p) => deck.dispatch({ type: 'keep', ...p })"
        @pad-volume="(p) => deck.dispatch({ type: 'padVolume', ...p })"
      />
    </div>
    <!-- One column when the deck fills the screen; at Deck size the dock is too short for seven in a column. -->
    <DeckToolStrip
      class="shrink-0 self-start"
      :class="fill ? 'w-24' : 'w-44'"
      :tool="snapshot.tool"
      :locked-tool="snapshot.lockedTool"
      :controls="ui.deckControls"
      :layout="fill ? 'column' : 'grid'"
      :show-keys="ui.deckControls === 'full'"
      @tool="(p) => deck.dispatch({ type: 'tool', ...p })"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from "vue";
import { firstRowInView, type RowBox } from "@/lib/audio/deck/rowInView";
import { useDeck } from "@/composables/soundboard/useDeck";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import DeckGrid from "./DeckGrid.vue";
import DeckToolStrip from "./DeckToolStrip.vue";

/**
 * Lanes, pads and the tool strip at Deck size (#1136). At Deck size the grid is
 * clipped to two and a half rows and scrolls inside; Full lets it fill.
 */

const { fill = false } = defineProps<{
  /** Full size: show every row instead of clipping to two and a half. */
  fill?: boolean;
}>();

const deck = useDeck();
const snapshot = deck.snapshot;
const ui = useSoundboardUiStore();

// Only worth fading when there is a third row to hint at.
const clipped = computed(() => !fill && snapshot.value.rows > 2);

// ── The row in view ─────────────────────────────────────────────────────────
// Keys 1 to 8 fire the deck's row in view. Scrolling here makes it the top row
// showing; opening here (Deck size, Full, a peek) scrolls to it, so the peek a
// key opens from the Row bar shows the row that key just played.

const scroller = useTemplateRef<HTMLElement>("scroller");
// The scroll event our own scrollTop write fires is not the DM choosing a row:
// at the bottom of a page the row cannot reach the top, and taking the top row
// then would move the keys off the row the DM was playing.
let ownScroll = false;

function rowBoxes(el: HTMLElement): RowBox[] {
  const boxes: RowBox[] = [];
  for (let row = 0; row < snapshot.value.rows; row++) {
    const cell = el.querySelector(`[data-cell="0:${row}"]`);
    if (!(cell instanceof HTMLElement)) break;
    const box = cell.getBoundingClientRect();
    boxes.push({ top: box.top, bottom: box.bottom });
  }
  return boxes;
}

/** Where the rows start to show: under the sticky lane headers. */
function viewTop(el: HTMLElement): number {
  const header = el.querySelector('[role="row"]');
  const covered = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
  return el.getBoundingClientRect().top + covered;
}

function onScroll(): void {
  if (ownScroll) {
    ownScroll = false;
    return;
  }
  const el = scroller.value;
  if (el === null) return;
  const row = firstRowInView(rowBoxes(el), viewTop(el));
  if (row !== snapshot.value.keyRow) deck.dispatch({ type: "showRow", row });
}

function scrollToKeyRow(): void {
  const el = scroller.value;
  if (el === null) return;
  const keyRow = snapshot.value.keyRow;
  if (firstRowInView(rowBoxes(el), viewTop(el)) === keyRow) return;
  const cell = el.querySelector(`[data-cell="0:${keyRow}"]`);
  if (!(cell instanceof HTMLElement)) return;
  const wanted = el.scrollTop + cell.getBoundingClientRect().top - viewTop(el);
  const next = Math.min(Math.max(0, wanted), Math.max(0, el.scrollHeight - el.clientHeight));
  if (Math.abs(next - el.scrollTop) < 1) return;
  ownScroll = true;
  el.scrollTop = next;
}

onMounted(() => void nextTick(scrollToKeyRow));
// The Row bar or a page change moved the row while this is open (a peek over the bar).
watch(
  () => snapshot.value.keyRow,
  () => void nextTick(scrollToKeyRow),
);
</script>

<style scoped>
.deck-fade {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent);
}
</style>
