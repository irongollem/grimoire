<template>
  <button
    v-if="isCastAvailable"
    class="shrink-0 transition-colors p-0.5"
    :class="isCasting
      ? 'text-gold-400 hover:text-gold-300'
      : 'text-muted-foreground hover:text-foreground'"
    :title="isCasting
      ? `Casting to ${castDeviceName ?? 'Google Home'} — click to stop`
      : 'Cast audio to Google Home'"
    @click="openDevicePicker()"
  >
    <IconCast class="h-3.5 w-3.5" />
  </button>
</template>

<script setup lang="ts">
import { IconCast } from "@/lib/icons";
import { useCast } from "@/composables/useCast";

const { isCastAvailable, isCasting, castDeviceName, openDevicePicker } = useCast();
</script>
