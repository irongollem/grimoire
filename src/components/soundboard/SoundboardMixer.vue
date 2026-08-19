<template>
  <div :class="stacked ? 'space-y-2' : 'flex flex-wrap items-center gap-x-4 gap-y-2'">
    <p
      v-if="store.isCasting"
      class="flex w-full items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-2xs text-amber-500"
    >
      <IconWarning class="mt-0.5 h-3 w-3 shrink-0" />
      <span>Casting plays the original audio. Mixer levels, effects, fades, and ducking do not apply.</span>
    </p>

    <!-- Same shape as the casting notice, and for the same reason: the mixer is
         where a DM looks when the sound is not doing what the faders say. -->
    <p
      v-if="store.directOutput"
      class="flex w-full items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-2xs text-amber-500"
    >
      <IconWarning class="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        Direct output is on to stop CarPlay and Bluetooth stuttering. Atmosphere presets and reverb
        are unavailable{{ store.volumeControlAvailable ? "" : ", and this device keeps volume on its own hardware controls" }}.
      </span>
    </p>

    <!-- Collapsible header — only used in the floating widget, where space is tight. -->
    <button
      v-if="collapsible"
      class="flex w-full items-center gap-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
      :aria-expanded="open"
      @click="open = !open"
    >
      <IconChevronRight
        class="h-3 w-3 shrink-0 transition-transform"
        :class="open ? 'rotate-90' : ''"
      />
      <span class="flex-1 font-cinzel text-2xs font-semibold tracking-wide">Mixer</span>
      <span v-if="!open" class="text-2xs tabular-nums">
        {{ Math.round(store.masterVolume * 100) }}
      </span>
    </button>

    <template v-if="!collapsible || open">
      <div class="flex min-w-0 items-center gap-2" :class="stacked ? '' : 'flex-1'">
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
          :model-value="store.masterEffect"
          @update:model-value="store.setMasterEffect($event)"
        />
      </div>

      <SceneMixer
        v-if="showScene"
        :class="stacked ? '' : 'w-full'"
        class="border-t border-border/50 pt-1.5"
      />

      <VolumeSlider
        v-for="bus in BUSES"
        :key="bus.id"
        class="min-w-0"
        :class="stacked ? '' : 'flex-1'"
        :label="bus.label"
        wide
        show-percent
        :muted="store.masterVolume === 0"
        :disabled-reason="store.volumeControlNote"
        :model-value="store.busVolumes[bus.id]"
        @update:model-value="store.setBusVolume(bus.id, $event)"
      />

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
        @click="ui.soundboardSettingsOpen = true"
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
    </template>

  </div>
</template>

<script setup lang="ts">
// The mixer is shared deliberately.
//
// There are two soundboard surfaces — the /soundboard page and the floating
// quick-access widget that follows the DM onto other pages — and they must not
// drift apart. A control that exists in one and not the other is worse than no
// control at all, because the DM learns it is there and then cannot find it.
// Anything new belongs here, not in one of the two hosts.
import { computed, ref } from "vue";
import { IconChevronRight, IconSettings, IconWarning } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { useUiStore } from "@/stores/ui";
import { useAudioTriggerPrefs } from "@/composables/useAudioThemeTriggers";
import { useSoundboardBroadcast } from "@/composables/useSoundboardBroadcast";
import type { AudioBus } from "@/lib/audio/audioEngine";
import VolumeSlider from "./VolumeSlider.vue";
import SoundEffectPicker from "./SoundEffectPicker.vue";
import SceneMixer from "./SceneMixer.vue";

const BUSES = [
  { id: "music", label: "Music" },
  { id: "ambient", label: "Ambience" },
  { id: "effects", label: "Effects" },
] as const satisfies readonly { id: AudioBus; label: string }[];

const { collapsible = false, column = false } = defineProps<{
  /** Widget mode: fold behind a disclosure row because vertical space is scarce. */
  collapsible?: boolean;
  /**
   * Narrow-column mode: faders stack instead of sharing a row.
   *
   * The wrapping row assumes a full-width strip. In a 16.5rem sidebar it
   * squeezes four faders and their labels onto one line, which is unreadable
   * and unusable.
   */
  column?: boolean;
}>();

/** Both the widget and the sidebar want vertical stacking; only the widget folds. */
const stacked = computed(() => collapsible || column);

const store = useSoundboardStore();
const ui = useUiStore();
// Read-only here; the dialog owns changing them.
const { audioTriggersEnabled } = useAudioTriggerPrefs();
const { broadcasting, broadcastError } = useSoundboardBroadcast();


// Only worth the space when a scene is actually running.
const showScene = computed(() => store.activeAmbientPlaylists.length > 0);

// Open by default even when collapsible — a collapsed grey row is
// indistinguishable from "nothing changed here".
const open = ref(true);
</script>
