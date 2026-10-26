<template>
  <p v-if="!supported" class="flex items-start gap-1.5 text-caption text-muted-foreground" role="status">
    <IconInfo class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span>This device can't play the app's sound effects. On an iPhone or iPad, updating to iOS 18.4 or later fixes it.</span>
  </p>
</template>

<script setup lang="ts">
/**
 * A one-line note for devices that cannot decode Ogg Vorbis (iPhone and iPad
 * Safari before iOS 18.4), the format of the sound library and the workshop
 * sounds. Detected with `canPlayType` through `canPlayOggVorbis`, never the
 * user agent. Renders nothing where Ogg plays.
 */
import { IconInfo } from "@/lib/icons";
import { canPlayOggVorbis } from "@/lib/audio/oggSupport";

const supported = canPlayOggVorbis();
</script>
