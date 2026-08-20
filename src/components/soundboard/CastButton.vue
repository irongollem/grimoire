<template>
  <AppButton
    v-if="isCastAvailable"
    variant="ghost"
    size="icon-2xs"
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
import { IconCast } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import { useCast } from "@/composables/useCast";

const { isCastAvailable, isCasting, castDeviceName, openDevicePicker } = useCast();
</script>
