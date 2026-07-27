<template>
  <div :class="collapsible ? 'space-y-1.5' : 'flex flex-wrap items-center gap-x-4 gap-y-2'">
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
      <div class="flex min-w-0 items-center gap-2" :class="collapsible ? '' : 'flex-1'">
        <VolumeSlider
          class="flex-1"
          label="Master"
          wide
          show-percent
          :model-value="store.masterVolume"
          @update:model-value="store.setMasterVolume($event)"
        />
        <!-- Puts the whole mix in a space, rather than one selected track. -->
        <SoundEffectPicker
          :model-value="store.masterEffect"
          @update:model-value="store.setMasterEffect($event)"
        />
      </div>

      <SceneMixer
        v-if="showScene"
        :class="collapsible ? '' : 'w-full'"
        class="border-t border-border/50 pt-1.5"
      />

      <VolumeSlider
        v-for="bus in BUSES"
        :key="bus.id"
        class="min-w-0"
        :class="collapsible ? '' : 'flex-1'"
        :label="bus.label"
        wide
        show-percent
        :muted="store.masterVolume === 0"
        :model-value="store.busVolumes[bus.id]"
        @update:model-value="store.setBusVolume(bus.id, $event)"
      />

      <!-- Whether the campaign is allowed to drive the board. Lives here rather
           than in settings because this is where a DM looks when the audio did
           something they did not ask for. -->
      <label
        class="flex cursor-pointer select-none items-center gap-1.5 text-2xs text-muted-foreground"
        :class="collapsible ? 'w-full border-t border-border/50 pt-1.5' : 'w-full'"
        title="Encounters and locations can request a playlist by theme. They are ignored when nothing matches."
      >
        <input
          type="checkbox"
          class="h-3 w-3 accent-gold-500"
          :checked="audioTriggersEnabled"
          @change="setAudioTriggersEnabled(($event.target as HTMLInputElement).checked)"
        />
        Let encounters and locations pick audio
      </label>

      <!-- Off every session on purpose: several devices in one room playing the
           same track comb-filter into a flanged mess, and most tables running
           this are in one room. -->
      <label
        class="flex w-full cursor-pointer select-none items-center gap-1.5 text-2xs text-muted-foreground"
        title="Share the music with players in the portal. For remote games — players must still opt in on their own device."
      >
        <input
          type="checkbox"
          class="h-3 w-3 accent-gold-500"
          :checked="broadcasting"
          @change="setBroadcasting(($event.target as HTMLInputElement).checked)"
        />
        Share music with remote players
      </label>

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
import { IconChevronRight } from "@/lib/icons";
import { useSoundboardStore } from "@/stores/soundboard";
import { useAudioTriggerPrefs } from "@/composables/useAudioThemeTriggers";
import { useSoundboardBroadcast } from "@/composables/useSoundboardBroadcast";
import type { AudioBus } from "@/lib/audioEngine";
import VolumeSlider from "./VolumeSlider.vue";
import SoundEffectPicker from "./SoundEffectPicker.vue";
import SceneMixer from "./SceneMixer.vue";

const BUSES = [
  { id: "music", label: "Music" },
  { id: "ambient", label: "Ambience" },
  { id: "effects", label: "Effects" },
] as const satisfies readonly { id: AudioBus; label: string }[];

const { collapsible = false } = defineProps<{
  /** Widget mode: fold behind a disclosure row because vertical space is scarce. */
  collapsible?: boolean;
}>();

const store = useSoundboardStore();
const { audioTriggersEnabled, setAudioTriggersEnabled } = useAudioTriggerPrefs();
const { broadcasting, broadcastError, setBroadcasting } = useSoundboardBroadcast();

// Only worth the space when a scene is actually running.
const showScene = computed(() => store.activeAmbientPlaylists.length > 0);

// Open by default even when collapsible — a collapsed grey row is
// indistinguishable from "nothing changed here".
const open = ref(true);
</script>
