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
      <AppCheckbox
        label-role="label-lg"
        label-weight="normal"
        label-tone="foreground"
        label="Let encounters and locations pick audio"
        hint="Give an encounter or a location a theme, label a playlist to match, and the audio follows the game. A request that matches nothing does nothing at all. It never stops or replaces what you already have running."
        :model-value="audioTriggersEnabled"
        @update:model-value="setAudioTriggersEnabled"
      />

      <div class="space-y-1.5">
        <AppCheckbox
          label-role="label-lg"
          label-weight="normal"
          label-tone="foreground"
          label="Share music with remote players"
          hint="Music only, and only for this session. Spotify is not included: it plays on your device only. It switches itself off again next time. Each player still presses Join on their own device, because a browser will not start audio without them and nobody's speakers should come alive on someone else's click. For remote tables: several devices in one room playing the same track sound worse than one."
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
          label="Direct output: fixes stuttering over CarPlay and Bluetooth"
          hint="Safari has an open bug that drops audio out every few seconds on wireless routes. Turning this on sends sound straight to the device instead of through our mixer, which sidesteps it. The cost: no atmosphere presets, no reverb, and on iPhone and iPad no faders or crossfades either. Apple reserves the volume for the hardware buttons, so the car's own dial becomes the only control. Worth it in the car, not at the table."
          :model-value="store.directOutput"
          @update:model-value="store.setDirectOutput"
        />
        <p class="pl-6.5 text-caption text-muted-foreground">
          Switching stops everything that is playing. The audio has to be rebuilt to change
          route.
        </p>
      </div>

      <!-- Temporary: the CarPlay experiment in lib/audio/bufferedPlaybackTest.ts. -->
      <div class="space-y-1.5 rounded-md border border-dashed border-border p-3">
        <p class="text-label-lg">CarPlay test: a music pad, loaded whole</p>
        <p class="text-caption text-muted-foreground">
          Plays a music pad you played this session, loaded into memory first instead of streamed
          through the mixer. Use it in the car with Direct output off: if it does not stutter, the
          mixer can be kept in the car.
        </p>
        <div class="flex items-center gap-2">
          <AppButton
            :variant="testPlaying ? 'tinted' : 'outline'"
            tone="primary"
            emphasis="soft"
            size="sm"
            :label="testPlaying ? 'Stop the test' : 'Play the test'"
            :loading="testLoading"
            :disabled="!testPlaying && testUrl === null"
            @click="toggleTest"
          />
          <span v-if="testUrl === null && !testPlaying" class="text-caption text-muted-foreground">Play a music pad first.</span>
          <span v-if="testError" class="text-caption text-destructive">{{ testError }}</span>
        </div>
      </div>

      <DeckControllersSection />
    </div>

    <div class="flex shrink-0 justify-end border-t border-border px-5 py-3">
      <AppButton variant="subtle" size="sm" label="Done" @click="emit('close')" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconSettings } from "@/lib/icons";
import { isBufferedTestPlaying, startBufferedTest, stopBufferedTest } from "@/lib/audio/bufferedPlaybackTest";
import { useAudioTriggerPrefs } from "@/composables/soundboard/useAudioThemeTriggers";
import { useSoundboardBroadcast } from "@/composables/soundboard/useSoundboardBroadcast";
import { useSoundboardStore } from "@/stores/soundboard";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import DeckControllersSection from "@/components/soundboard/DeckControllersSection.vue";

/**
 * The two switches that used to sit in the mixer wearing faders' clothes.
 *
 * The mixer keeps a read-only echo of their state, because it is still where a
 * DM looks when the audio surprised them — it just stops being the place you
 * change them.
 */

const { open } = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

const store = useSoundboardStore();
const { audioTriggersEnabled, setAudioTriggersEnabled } = useAudioTriggerPrefs();
const { broadcasting, broadcastError, setBroadcasting } = useSoundboardBroadcast();

// The CarPlay buffered-playback experiment. Temporary, like its module.
const testPlaying = ref(isBufferedTestPlaying());
const testLoading = ref(false);
const testError = ref<string | null>(null);
const testUrl = computed(() => (open ? store.lastFileUrl("music") : null));

async function toggleTest(): Promise<void> {
  testError.value = null;
  if (testPlaying.value) {
    stopBufferedTest();
    testPlaying.value = false;
    return;
  }
  const url = testUrl.value;
  if (url === null) return;
  // The board's own audio would play over the test and hide what it measures.
  store.stopAll();
  testLoading.value = true;
  try {
    await startBufferedTest(url);
    testPlaying.value = true;
  } catch (error) {
    testError.value = error instanceof Error ? error.message : "The test could not start";
  } finally {
    testLoading.value = false;
  }
}
</script>

