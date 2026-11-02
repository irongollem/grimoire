<template>
  <div>
    <label class="block text-label-lg font-semibold text-muted-foreground mb-2">{{ label }}</label>
    <div class="flex flex-col gap-1.5">
      <AppButton
        v-for="opt in options"
        :key="opt.value"
        variant="outline"
        fill="muted"
        size="md"
        block
        :active="model === opt.value"
        @click="model = opt.value"
      >
        <div class="flex-1 min-w-0">
          <span class="text-caption font-semibold text-foreground">{{ opt.label }}</span>
          <p class="text-caption text-muted-foreground mt-0.5">{{ opt.desc }}</p>
        </div>
        <IconCheck v-if="model === opt.value" class="h-3.5 w-3.5 text-primary shrink-0" />
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconCheck } from "@/lib/icons";

defineProps<{
  label: string;
  options: readonly { value: T; label: string; desc: string }[];
}>();

const model = defineModel<T>({ required: true });
</script>
