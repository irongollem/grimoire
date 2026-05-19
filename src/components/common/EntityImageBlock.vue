<template>
  <div class="flex flex-col gap-0">
    <!-- Variant tabs (e.g. True Form / Alter Ego, Identified / Mundane) -->
    <div v-if="variants && variants.length > 1" class="flex border-b border-border">
      <button
        v-for="variant in variants"
        :key="variant.id"
        type="button"
        class="px-3 py-1.5 font-cinzel text-[11px] font-semibold tracking-wider border-b-2 transition-colors"
        :class="activeVariantId === variant.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="emit('update:activeVariantId', variant.id)"
      >{{ variant.label }}</button>
    </div>

    <ImageUpload
      :model-value="modelValue || null"
      :focal-point="focalPoint"
      :bucket="bucket"
      :show-focal-point="showFocalPoint"
      :folder-prefix="folderPrefix"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event ?? '')"
      @update:focal-point="emit('update:focalPoint', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import ImageUpload from "@/components/common/ImageUpload.vue";

export interface ImageVariant {
  id: string;
  label: string;
}

defineProps<{
  modelValue: string | null | undefined;
  focalPoint?: { x: number; y: number } | null;
  bucket: string;
  showFocalPoint?: boolean;
  folderPrefix?: string;
  disabled?: boolean;
  variants?: ReadonlyArray<ImageVariant>;
  activeVariantId?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:focalPoint", value: { x: number; y: number } | null): void;
  (e: "update:activeVariantId", value: string): void;
}>();
</script>
