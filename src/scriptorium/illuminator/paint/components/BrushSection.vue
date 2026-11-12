<template>
  <section class="border-t border-border">
    <div class="flex items-center gap-2 px-3 py-2">
      <AppButton variant="ghost" class="min-w-0 flex-1 justify-start text-left" :aria-expanded="isOpen" @click="isOpen = !isOpen">
        <IconChevronRight class="h-3 w-3 shrink-0 transition-transform" :class="isOpen ? 'rotate-90' : ''" />
        <span class="flex min-w-0 flex-col items-start">
          <span class="text-label-lg font-bold uppercase" :class="enabled === false ? 'text-muted-foreground' : 'text-foreground'">{{ title }}</span>
          <span class="max-w-full truncate text-caption-sm font-normal text-muted-foreground">{{ summary }}</span>
        </span>
      </AppButton>
      <ToggleSwitch v-if="enabled !== undefined" :model-value="enabled" :aria-label="`${title} on or off`" @update:model-value="emit('update:enabled', $event)" />
    </div>
    <div v-if="isOpen && enabled !== false" class="flex flex-col gap-3 px-3 pb-3">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import { IconChevronRight } from "@/lib/icons";

/**
 * One section of the brush settings: a header with its name and a one-line summary, an on/off switch where the
 * section can be off (`enabled` left undefined means it cannot), and controls that open beneath. A section that
 * is off cannot be opened: its controls would edit nothing.
 */
const { title, summary, enabled, open = false } = defineProps<{ title: string; summary: string; enabled?: boolean; open?: boolean }>();
const emit = defineEmits<{ "update:enabled": [value: boolean] }>();
const isOpen = ref(open);
</script>
