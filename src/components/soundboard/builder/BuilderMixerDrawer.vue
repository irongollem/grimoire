<template>
  <!-- Mixer — the same component the floating widget uses, so the two
       soundboard surfaces can never drift apart. Desktop only: below lg
       the floating widget is the mixer surface. -->
  <Transition v-bind="railTransition()">
    <aside
      v-if="soundboardUi.soundboardMixerOpen"
      class="sticky top-0 hidden shrink-0 pl-4 lg:block"
      aria-label="Mixer"
    >
      <!-- The card is a fixed-width child of the rail, not the rail itself.
           The rail is clipped as it opens, so a full-width card would reflow
           to the shrinking box and squeeze the faders shut; at a fixed width
           it holds its shape and slides out from behind the page edge. -->
      <div class="w-72 rounded-lg border border-border bg-card">
        <!-- No Stop All here: it has exactly one home, the widget header, which
             follows the DM everywhere including this page. Two panic buttons
             for the same act is how one of them drifts. -->
        <div class="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <h2 class="flex-1 text-eyebrow font-bold text-gold-500 uppercase">
            Mixer
          </h2>
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="IconClose"
            icon-size="sm"
            aria-label="Close the mixer"
            tooltip="Close the mixer"
            @click="soundboardUi.soundboardMixerOpen = false"
          />
        </div>
        <div class="px-3 py-2">
          <SoundboardMixer />
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { IconClose } from "@/lib/icons";
import { railTransition } from "@/lib/motion";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import AppButton from "@/components/common/controls/AppButton.vue";
import SoundboardMixer from "@/components/soundboard/SoundboardMixer.vue";

const soundboardUi = useSoundboardUiStore();
</script>
