<template>
  <!-- Only while something is being shared: with sharing and Cast both off,
       "this plays on your device only" is true of everything and says nothing. -->
  <template v-if="sharing">
    <span ref="triggerRef" class="inline-flex shrink-0">
      <AppButton
        variant="ghost"
        size="icon-2xs"
        icon-size="xs"
        :icon="IconInfo"
        tooltip="Spotify plays on this device only"
        aria-label="Spotify plays on this device only. Why?"
        :aria-expanded="open"
        @click="open = !open"
      />
    </span>

    <!-- Teleported: the floating player clips its own overflow, and a note cut in
         half there would be worse than none. A tap opens it rather than a hover,
         because on a tablet at the table a `title` never appears. -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="floatingRef"
        :style="floatingStyle"
        data-slip
        role="note"
        class="z-9999 w-64 space-y-1 rounded-md border border-border bg-popover p-3 shadow-lg"
      >
        <p class="text-label-lg text-foreground">Plays on this device only</p>
        <p class="text-caption text-muted-foreground">
          Remote players who joined your shared audio and cast speakers will not hear Spotify. Its terms
          only allow playing it on your own device, so put it through speakers in the room instead.
        </p>
      </div>
    </Teleport>
  </template>
</template>

<script setup lang="ts">
// Spotify never reaches shared audio or Cast: both mirror Grimoire's own music
// playlist, and Spotify's Developer Policy (III.4) forbids streaming its content
// to several listeners. Without this the DM turned sharing on, played Spotify,
// and the table heard silence with nothing saying why.
import { ref, watch } from "vue";
import { IconInfo } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useAudioSharing } from "@/composables/soundboard/useAudioSharing";

const sharing = useAudioSharing();

const open = ref(false);
// Sharing ending under an open note closes it, so it is not open again the
// next time sharing starts.
watch(sharing, (on) => {
  if (!on) open.value = false;
});
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});
</script>
