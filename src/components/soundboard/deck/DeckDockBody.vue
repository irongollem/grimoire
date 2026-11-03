<template>
  <div class="flex min-h-0 gap-3" :class="fill ? 'flex-1' : ''">
    <!-- Lane headers stay put while the rows scroll; the mask says "more below" instead of cutting a pad mid-way. -->
    <div
      class="deck-scroll min-w-0 flex-1 overflow-y-auto overscroll-contain"
      :class="[fill ? '' : 'max-h-58', clipped ? 'deck-fade' : '']"
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
    <DeckToolStrip
      class="w-44 shrink-0 self-start"
      :tool="snapshot.tool"
      :locked-tool="snapshot.lockedTool"
      :controls="ui.deckControls"
      layout="grid"
      :show-keys="ui.deckControls === 'full'"
      @tool="(p) => deck.dispatch({ type: 'tool', ...p })"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
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
</script>

<style scoped>
.deck-fade {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent);
}
</style>
