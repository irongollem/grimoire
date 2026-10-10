<template>
  <section class="rounded-lg border border-border bg-card p-3" data-testid="disguise-panel">
    <p class="mb-2 text-label font-semibold uppercase text-muted-foreground">In disguise</p>
    <div class="flex items-center gap-3">
      <div class="relative h-18 w-14 shrink-0 overflow-hidden rounded">
        <FocalImage
          :src="npc.disguise_portrait_url"
          :focal-point="npc.disguise_portrait_focal_point"
          format="portrait"
          :placeholder="placeholderUrl('npc')"
        />
        <AiImageBadge :src="npc.disguise_portrait_url" />
      </div>
      <div class="min-w-0">
        <p class="truncate text-heading-sm font-bold text-foreground">{{ npc.disguise_name ?? "Unnamed cover" }}</p>
        <p class="text-caption italic text-muted-foreground">as the party knows them</p>
      </div>
    </div>
    <div class="mt-3">
      <template v-if="revealed">
        <p class="mb-1.5 text-caption font-semibold text-foreground">True self revealed</p>
        <AppButton variant="subtle" size="xs" label="Put the disguise back on" @click="emit('change', false)" />
      </template>
      <AppButton v-else variant="live" size="sm" block label="Reveal true self" @click="emit('change', true)" />
    </div>
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AiImageBadge from "@/components/common/AiImageBadge.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { NpcListRow } from "@/types/npc.types";

defineProps<{ npc: NpcListRow; revealed: boolean }>();
const emit = defineEmits<{ (e: "change", revealed: boolean): void }>();
</script>
