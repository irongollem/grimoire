<template>
  <div class="flex flex-col gap-3">
    <div v-for="(item, i) in items" :key="i" class="rounded-md border border-border bg-card p-3 flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="flex-1 text-label-lg font-semibold text-muted-foreground">{{ itemLabel }} {{ i + 1 }}</span>
        <AppButton variant="ghost" tone="danger" size="xs" :icon="IconDelete" icon-size="xs" label="Remove" @click="emit('remove', i)" />
      </div>
      <slot :item="item" :index="i" />
    </div>
    <div>
      <AppButton variant="outline" size="sm" :icon="IconAdd" icon-size="xs" :label="addLabel" @click="emit('add')" />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { IconAdd, IconDelete } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";

/** The frame for a list of repeated parts (riders, sub-actions, choices): numbered cards, one add button. */
defineProps<{ items: readonly T[]; itemLabel: string; addLabel: string }>();
const emit = defineEmits<{ add: []; remove: [index: number] }>();
</script>
