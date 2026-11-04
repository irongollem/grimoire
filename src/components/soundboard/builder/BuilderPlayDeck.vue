<template>
  <div class="flex min-w-0 flex-col gap-3">
    <div class="flex min-w-0 items-start gap-3">
      <DeckGrid
        class="min-w-0 flex-1"
        :lanes="snapshot.lanes"
        :cells="snapshot.cells"
        :rows="snapshot.rows"
        :lane-start="laneStart"
        :lane-count="laneCount"
        :size="phone ? 'sm' : 'md'"
        :controls="soundboardUi.deckControls"
        :tool="snapshot.tool"
        mode="play"
        @press="deck.dispatch({ type: 'press', ...$event })"
        @release="deck.dispatch({ type: 'release', ...$event })"
        @keep="deck.dispatch({ type: 'keep', ...$event })"
        @pad-volume="deck.dispatch({ type: 'padVolume', ...$event })"
      />
      <DeckToolStrip
        v-if="!phone"
        class="w-40 shrink-0"
        :tool="snapshot.tool"
        :locked-tool="snapshot.lockedTool"
        :controls="soundboardUi.deckControls"
        layout="grid"
        show-keys
        @tool="deck.dispatch({ type: 'tool', ...$event })"
      />
    </div>
    <DeckToolStrip
      v-if="phone"
      :tool="snapshot.tool"
      :locked-tool="snapshot.lockedTool"
      :controls="soundboardUi.deckControls"
      layout="row"
      :show-keys="false"
      @tool="deck.dispatch({ type: 'tool', ...$event })"
    />
    <DeckTransport
      :paused="snapshot.paused"
      :hush="snapshot.hush"
      :master-volume="snapshot.masterVolume"
      :compact="phone"
      @pause-all="deck.dispatch({ type: 'pauseAll' })"
      @fade-all="deck.dispatch({ type: 'fadeAll' })"
      @hush="deck.dispatch({ type: 'hush', ...$event })"
      @master="deck.dispatch({ type: 'master', value: $event })"
    />
    <p v-if="soundboardUi.deckControls === 'full' && !phone" class="text-caption text-muted-foreground">
      Keys <b class="text-gold-400">1 to 8</b> fire the row with their numbers on it. Space pauses everything.
    </p>
  </div>
</template>

<script setup lang="ts">
import { useDeck } from "@/composables/soundboard/useDeck";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import DeckGrid from "@/components/soundboard/deck/DeckGrid.vue";
import DeckToolStrip from "@/components/soundboard/deck/DeckToolStrip.vue";
import DeckTransport from "@/components/soundboard/deck/DeckTransport.vue";

/**
 * The deck as it is played on /soundboard (#1136). The docked deck is hidden on
 * this route, so this page is the deck here: the same grid, tool strip and
 * transport, wired to the same controller.
 */
const { laneStart, laneCount, phone } = defineProps<{
  laneStart: number;
  laneCount?: number;
  phone: boolean;
}>();

const deck = useDeck();
const snapshot = deck.snapshot;
const soundboardUi = useSoundboardUiStore();
</script>
