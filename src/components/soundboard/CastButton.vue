<template>
  <AppButton
    v-if="isCastAvailable"
    :variant="variant"
    :size="size"
    icon-size="xs"
    :active="isCasting"
    active-fill="none"
    class="shrink-0"
    :icon="IconCast"
    :tooltip="isCasting
      ? `Casting to ${castDeviceName ?? 'Google Home'} — click to stop`
      : 'Cast audio to Google Home'"
    @click="openDevicePicker()"
  />
</template>

<script setup lang="ts">
/**
 * The Google Cast toggle, shared by the soundboard page and the floating widget.
 *
 * It is a component rather than markup at each site because the soundboard has TWO
 * surfaces and controls that live on both have drifted apart here before. Sharing
 * it also shares the `useCast()` wiring, the `isCastAvailable` guard and the
 * device-name tooltip, which is most of the file.
 *
 * `variant`/`size` are props because the two surfaces genuinely want different
 * chrome — the widget's row is borderless, the playlist card's transport row is
 * boxed (`subtle`, whose border-plus-muted-text recipe is exactly what that call
 * site was hand-drawing). PlaylistCard used to get that by passing
 * `class="p-1.5 rounded-md border border-border"`, i.e. drawing a box on top of a
 * ghost button, which is the recipe-in-a-class-string this sweep exists to remove.
 */
import { IconCast } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import type { ButtonSize, ButtonVariant } from "@/components/common/appButtonVariants";
import { useCast } from "@/composables/useCast";

const { variant = "ghost", size = "icon-2xs" } = defineProps<{
  variant?: ButtonVariant;
  size?: ButtonSize;
}>();

const { isCastAvailable, isCasting, castDeviceName, openDevicePicker } = useCast();
</script>
