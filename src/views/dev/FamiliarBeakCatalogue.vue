<template>
  <!-- Ooru's beak against a real voice, without speech keys: a clip of the greeting in the Mac's own "Daniel" voice,
       through the same meter and avatar the Familiar uses. For tuning the thresholds by eye (audioMeter.ts). -->
  <div class="flex flex-wrap items-center gap-6">
    <FamiliarAvatar class="size-24" :speaking="playing" :level="playing && metered ? level : null" />
    <div class="flex flex-col gap-2">
      <AppButton variant="outline" size="sm" :icon="playing ? IconStop : IconPlay" :label="playing ? 'Stop' : 'Play the greeting'" @click="toggle" />
      <p class="font-mono text-caption text-muted-foreground" data-testid="beak-readout">
        level {{ level.toFixed(3) }} · {{ metered ? "measured" : "not measured (loop fallback)" }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import FamiliarAvatar from "@/components/ask/FamiliarAvatar.vue";
import { meterAudio, primeAudioMeter } from "@/composables/voices/audioMeter";
import { IconPlay, IconStop } from "@/lib/icons";
import sampleUrl from "./ooru-sample.mp3";

const playing = ref(false);
const metered = ref(false);
const level = ref(0);
let audio: HTMLAudioElement | null = null;

function stop(): void {
  audio?.pause();
  audio = null;
  playing.value = false;
}

function toggle(): void {
  if (playing.value) return stop();
  primeAudioMeter();
  const el = new Audio(sampleUrl);
  audio = el;
  el.addEventListener("ended", stop, { once: true });
  playing.value = true;
  metered.value = false;
  void meterAudio(el, (l) => (level.value = l)).then((s) => {
    if (audio === el) metered.value = s !== null;
  });
  void el.play().catch(stop);
}

onBeforeUnmount(stop);
</script>
