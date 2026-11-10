<template>
  <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
    <span class="text-eyebrow font-bold text-primary">Deck</span>

    <div v-if="snapshot.pages.length > 0" class="flex min-w-0 gap-1 overflow-x-auto" role="tablist" aria-label="Pages">
      <AppButton
        v-for="(page, index) in snapshot.pages"
        :key="page.id"
        variant="ghost"
        size="sm"
        role="tab"
        :active="index === snapshot.pageIndex"
        :aria-selected="index === snapshot.pageIndex"
        :label="page.name"
        class="shrink-0"
        @click="deck.dispatch({ type: 'page', index })"
      />
    </div>

    <div class="min-w-48 flex-1 overflow-x-auto scrollbar-none"><DeckNowChips /></div>

    <DeckTransport
      :paused="snapshot.paused"
      :hush="snapshot.hush"
      :master-volume="snapshot.masterVolume"
      @pause-all="deck.dispatch({ type: 'pauseAll' })"
      @fade-all="deck.dispatch({ type: 'fadeAll' })"
      @hush="({ phase }) => deck.dispatch({ type: 'hush', phase })"
      @master="(value) => deck.dispatch({ type: 'master', value })"
    />

    <div class="flex items-center gap-1.5">
      <DeckMixerPopover />
      <DeckSizeControl :model-value="size" @update:model-value="(value) => emit('update:size', value)" />
      <DeckSettingsPopover />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { useDeck } from "@/composables/soundboard/useDeck";
import type { DeckSize } from "@/lib/audio/deck/deckSurface";
import DeckMixerPopover from "./DeckMixerPopover.vue";
import DeckNowChips from "./DeckNowChips.vue";
import DeckSettingsPopover from "./DeckSettingsPopover.vue";
import DeckSizeControl from "./DeckSizeControl.vue";
import DeckTransport from "./DeckTransport.vue";

/**
 * The docked deck's header (#1136): pages, what is audible, the whole-deck
 * controls, then the size switch and the settings pip. Everything here is the
 * protocol, so it can only do what a keyboard or a Launchpad can.
 */

const { size } = defineProps<{ size: DeckSize }>();
const emit = defineEmits<{ "update:size": [value: DeckSize] }>();

const deck = useDeck();
const snapshot = deck.snapshot;
</script>
