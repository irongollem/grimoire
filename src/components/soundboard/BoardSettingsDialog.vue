<template>
  <AppModal
    :open="open"
    size="md"
    @close="emit('close')"
  >
    <ModalHeader
      title="Board settings"
      :icon="IconSettings"
      tone="gold"
      closeable
      @close="emit('close')"
    />

    <!--
      Both of these were checkboxes wedged in among the mixer's faders.
      They are settings, not levels, and each one needs its reasoning
      beside it: a DM who does not know the rule cannot tell whether the
      feature is broken or working exactly as intended.
    -->
    <!-- Scrolls because the shell caps the panel at the viewport, where the old
         hand-rolled panel simply overflowed it. Three settings each carrying
         their reasoning measures ~36rem, so a short laptop would otherwise clip
         this at the Done button rather than let the reader scroll to it. -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-5 px-5 py-4">
      <!-- A preference, not performance chrome: three size buttons parked
           beside the mode control competed with it on every visit for a
           decision made about once per campaign. -->
      <section class="space-y-1.5">
        <span class="block font-cinzel text-body-sm text-foreground">Pad size in Perform</span>
        <!-- The selected size used to be a `bg-card` chip in a trough — a
             rival to AppButton's gold `active` tint, which is the app's one
             selected treatment. -->
        <SegmentedControl
          :model-value="ui.soundboardPadSize"
          :options="PAD_SIZES"
          size="sm"
          @update:model-value="(v) => (ui.soundboardPadSize = v)"
        />
        <p class="text-caption text-muted-foreground">
          {{ PAD_SIZES.find((p) => p.value === ui.soundboardPadSize)?.hint }}
        </p>
      </section>

      <AppCheckbox
        label-role="label-lg"
        label-weight="normal"
        label-tone="foreground"
        label="Let encounters and locations pick audio"
        hint="Give an encounter or a location a theme, label a playlist to match, and the audio follows the game. A request that matches nothing does nothing at all — it never stops or replaces what you already have running."
        :model-value="audioTriggersEnabled"
        @update:model-value="setAudioTriggersEnabled"
      />

      <div class="space-y-1.5">
        <AppCheckbox
          label-role="label-lg"
          label-weight="normal"
          label-tone="foreground"
          label="Share music with remote players"
          hint="Music only, and only for this session — it switches itself off again next time. Each player still presses Join on their own device, because a browser will not start audio without them and nobody's speakers should come alive on someone else's click. For remote tables: several devices in one room playing the same track sound worse than one."
          :model-value="broadcasting"
          @update:model-value="setBroadcasting"
        />
        <p v-if="broadcastError" class="pl-6.5 text-caption text-destructive">
          {{ broadcastError }}
        </p>
      </div>

      <div class="space-y-1.5">
        <AppCheckbox
          label-role="label-lg"
          label-weight="normal"
          label-tone="foreground"
          label="Direct output — fixes stuttering over CarPlay and Bluetooth"
          hint="Safari has an open bug that drops audio out every few seconds on wireless routes. Turning this on sends sound straight to the device instead of through our mixer, which sidesteps it. The cost: no atmosphere presets, no reverb, and on iPhone and iPad no faders or crossfades either — Apple reserves the volume for the hardware buttons, so the car's own dial becomes the only control. Worth it in the car, not at the table."
          :model-value="store.directOutput"
          @update:model-value="store.setDirectOutput"
        />
        <p class="pl-6.5 text-caption text-muted-foreground">
          Switching stops everything that is playing — the audio has to be rebuilt to change
          route.
        </p>
      </div>
    </div>

    <div class="flex shrink-0 justify-end border-t border-border px-5 py-3">
      <AppButton variant="subtle" size="sm" label="Done" @click="emit('close')" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { IconSettings } from "@/lib/icons";
import { useAudioTriggerPrefs } from "@/composables/useAudioThemeTriggers";
import { useSoundboardBroadcast } from "@/composables/useSoundboardBroadcast";
import { useSoundboardStore } from "@/stores/soundboard";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/SegmentedControl.vue";
import type { PadSize } from "@/types/sound.types";
import { useUiStore } from "@/stores/ui";

const PAD_SIZES = [
  { value: "sm", label: "Small", hint: "Name and colour only — fits the most on screen." },
  { value: "md", label: "Medium", hint: "Name, length and loop mark." },
  { value: "lg", label: "Large", hint: "Adds the artist." },
] as const satisfies readonly (SegmentedOption<PadSize> & { hint: string })[];

/**
 * The two switches that used to sit in the mixer wearing faders' clothes.
 *
 * The mixer keeps a read-only echo of their state, because it is still where a
 * DM looks when the audio surprised them — it just stops being the place you
 * change them.
 */

const { open } = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const ui = useUiStore();
const store = useSoundboardStore();
const { audioTriggersEnabled, setAudioTriggersEnabled } = useAudioTriggerPrefs();
const { broadcasting, broadcastError, setBroadcasting } = useSoundboardBroadcast();
</script>

