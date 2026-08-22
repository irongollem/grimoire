<template>
  <!-- Portrait -->
  <div v-if="pc.portrait_url" class="w-full h-36 shrink-0 bg-muted overflow-hidden">
    <FocalImage
      :src="pc.portrait_url"
      :focal-point="pc.portrait_focal_point ?? undefined"
      :alt="pc.name"
      format="square"
      class="w-full h-full"
    />
  </div>

  <div class="p-4 space-y-3">
    <div class="flex items-start justify-between gap-2">
      <h2 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ pc.name }}</h2>
      <button type="button" class="text-muted-foreground hover:text-foreground transition-colors shrink-0" @click="$emit('close')">
        <IconClose class="h-4 w-4" />
      </button>
    </div>
    <div class="flex items-center gap-1.5 text-label font-bold text-amber-400">
      <IconShield class="h-3 w-3" />
      Party Member
    </div>
    <div v-if="pc.class || speciesName" class="text-caption text-muted-foreground">
      {{ [pc.class, speciesName].filter(Boolean).join(' · ') }}
    </div>
    <div class="font-cinzel text-xs text-foreground">Level {{ pc.level }}</div>
    <AppButton
      :to="`/party/${pc.id}`"
      variant="tinted"
      tone="caution"
      emphasis="solid"
      size="sm"
      block
      class="mt-2"
      label="Open Sheet"
    />
  </div>
</template>

<script setup lang="ts">
import { IconClose, IconShield } from '@/lib/icons';
import AppButton from '@/components/common/AppButton.vue';
import FocalImage from '@/components/common/FocalImage.vue';

interface PcPanelData {
  id: string;
  name: string;
  class?: string | null;
  level: number;
  portrait_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
}

const {
  pc,
  speciesName,
} = defineProps<{
  pc: PcPanelData;
  speciesName: string | null;
}>();

defineEmits<{
  close: [];
}>();
</script>
