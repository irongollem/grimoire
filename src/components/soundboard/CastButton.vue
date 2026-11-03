<template>
  <AppButton
    v-if="isCastAvailable"
    :variant="variant"
    :size="size"
    icon-size="xs"
    :active="isCasting"
    :loading="isCastLoading"
    active-fill="none"
    class="shrink-0"
    :icon="IconCast"
    :tooltip="isCasting
      ? `Casting to ${castDeviceName ?? 'Google Home'}. Click to stop`
      : needsSecondClick
        ? 'Cast is ready. Click again to choose a speaker'
        : 'Cast audio to Google Home'"
    @click="openDevicePicker()"
  />
</template>

<script setup lang="ts">
/**
 * The Google Cast toggle, in the shared SoundboardMixer (#1136) and nowhere that
 * is always mounted: mounting it loads the Cast SDK. One component; it carries the
 * `useCast()` wiring, the `isCastAvailable` guard and the device-name tooltip,
 * which is most of the file.
 *
 * `variant`/`size` are props because surfaces want different chrome, borderless
 * or boxed (`subtle`).
 */
import { IconCast } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { ButtonSize, ButtonVariant } from "@/components/common/controls/appButtonVariants";
import { useCast } from "@/composables/soundboard/useCast";

const { variant = "ghost", size = "icon-2xs" } = defineProps<{
  variant?: ButtonVariant;
  size?: ButtonSize;
}>();

const { isCastAvailable, isCastLoading, needsSecondClick, isCasting, castDeviceName, openDevicePicker } = useCast();
</script>
