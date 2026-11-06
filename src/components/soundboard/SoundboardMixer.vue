<template>
  <div class="space-y-2">
    <p
      v-if="store.isCasting"
      class="flex w-full items-start gap-1.5 rounded-md border border-tone-caution/30 bg-tone-caution/10 px-2 py-1.5 text-2xs text-ink-caution"
    >
      <IconWarning class="mt-0.5 h-3 w-3 shrink-0" />
      <span>Casting plays the original audio. Mixer levels, effects, fades, and ducking do not apply.</span>
    </p>

    <!-- Same shape as the casting notice, and for the same reason: the mixer is
         where a DM looks when the sound is not doing what the faders say. -->
    <p
      v-if="store.directOutput"
      class="flex w-full items-start gap-1.5 rounded-md border border-tone-caution/30 bg-tone-caution/10 px-2 py-1.5 text-2xs text-ink-caution"
    >
      <IconWarning class="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        Direct output is on to stop CarPlay and Bluetooth stuttering. Atmosphere presets and reverb
        are unavailable{{ store.volumeControlAvailable ? "" : ", and this device keeps volume on its own hardware controls" }}.
      </span>
    </p>

    <div class="space-y-2">
      <!-- Cast lives here, not in the always-docked header: the Cast SDK is
           loaded when a CastButton first mounts, and its device discovery made
           audio crackle when it ran from app start. The mixer exists only while
           it is open. -->
      <div v-if="isCastAvailable" class="flex items-center justify-between gap-2">
        <span class="text-caption text-muted-foreground">Cast to a speaker</span>
        <CastButton variant="subtle" size="icon-sm" />
      </div>

        <div class="flex min-w-0 items-center gap-2">
          <VolumeSlider
            class="flex-1"
            label="Master"
            wide
            show-percent
            :disabled-reason="store.volumeControlNote"
            :model-value="store.masterVolume"
            @update:model-value="store.setMasterVolume($event)"
          />
          <!-- Puts the whole mix in a space, rather than one selected track.
               Direct output has no graph to put anything in, so the control goes
               rather than sitting there doing nothing. -->
          <SoundEffectPicker
            v-if="!store.directOutput"
            target="Master"
            :model-value="store.masterEffect"
            @update:model-value="store.setMasterEffect($event)"
          />
        </div>

        <SceneMixer v-if="showScene" class="border-t border-border/50 pt-1.5" />

        <!-- Each bus can sit in a space of its own ("the music is through a door"),
             under the master's. Filter only: the reverb send is the master's and
             each sound's, so a Cave here muffles and the master adds the echo. -->
        <div v-for="bus in BUSES" :key="bus.id" class="flex min-w-0 items-center gap-2">
          <VolumeSlider
            class="min-w-0 flex-1"
            :label="bus.label"
            wide
            show-percent
            :muted="store.masterVolume === 0"
            :disabled-reason="store.volumeControlNote"
            :model-value="store.busVolumes[bus.id]"
            @update:model-value="store.setBusVolume(bus.id, $event)"
          />
          <SoundEffectPicker
            v-if="!store.directOutput"
            :target="bus.label"
            :model-value="store.busEffects[bus.id]"
            @update:model-value="store.setBusEffect(bus.id, $event)"
          />
        </div>

        <!--
          A read-only echo, not a control. The mixer is for levels; two
          checkboxes among the faders read as levels too. But this is still where
          a DM looks when the audio did something they did not ask for, so the
          state stays visible here and opens the dialog that owns it.
        -->
        <button
          type="button"
          class="flex w-full items-center gap-1.5 border-t border-border/50 pt-1.5 text-left text-2xs text-muted-foreground transition-colors hover:text-foreground"
          title="Open board settings"
          @click="openBoardSettings"
        >
          <IconSettings class="h-3 w-3 shrink-0" />
          <span>
            Triggers {{ audioTriggersEnabled ? "on" : "off" }} · Sharing {{ broadcasting ? "on" : "off" }}
            · Output {{ store.directOutput ? "direct" : "mixer" }}
          </span>
        </button>

        <p v-if="broadcastError" class="w-full text-2xs text-destructive">
          {{ broadcastError }}
        </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// The mixer is shared deliberately: the deck's header opens it on every page
// and /soundboard shows it in a drawer (#1136), and the two must not drift. A
// control in one and not the other is worse than none, because the DM learns it
// is there and then cannot find it. Anything new belongs here.
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconSettings, IconWarning } from "@/lib/icons";
import { useCast } from "@/composables/soundboard/useCast";
import CastButton from "./CastButton.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import { useAudioTriggerPrefs } from "@/composables/soundboard/useAudioThemeTriggers";
import { useSoundboardBroadcast } from "@/composables/soundboard/useSoundboardBroadcast";
import type { AudioBus } from "@/lib/audio/audioEngine";
import VolumeSlider from "./VolumeSlider.vue";
import SoundEffectPicker from "./SoundEffectPicker.vue";
import SceneMixer from "./SceneMixer.vue";

const BUSES = [
  { id: "music", label: "Music" },
  { id: "ambient", label: "Ambience" },
  { id: "effects", label: "Effects" },
] as const satisfies readonly { id: AudioBus; label: string }[];

// The faders always stack: both places that mount the mixer are narrow (the
// deck's popover and the /soundboard drawer).

const store = useSoundboardStore();
const soundboardUi = useSoundboardUiStore();
// Read-only here; the dialog owns changing them.
const { audioTriggersEnabled } = useAudioTriggerPrefs();
const { broadcasting, broadcastError } = useSoundboardBroadcast();


// Only worth the space when a scene is actually running.
const showScene = computed(() => store.activeAmbientPlaylists.length > 0);
const { isCastAvailable } = useCast();

// Board settings is mounted on /soundboard only, so from the deck's mixer on
// any other page the click goes there first; otherwise it would do nothing.
const route = useRoute();
const router = useRouter();
async function openBoardSettings(): Promise<void> {
  soundboardUi.soundboardSettingsOpen = true;
  if (!route.path.startsWith("/soundboard")) await router.push("/soundboard");
}
</script>
