<template>
  <Transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="$emit('close')"
    >
      <div :class="['bg-card rounded-xl border border-border w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]', maxWidthClass]">
        <div class="relative shrink-0">
          <div v-if="portraitSrc" :class="['w-full overflow-hidden', portraitHeightClass]">
            <FocalImage
              :src="portraitSrc"
              :alt="portraitAlt ?? ''"
              format="portrait"
              :focal-point="focalPoint ?? null"
              :placeholder="placeholder"
              class="w-full h-full object-cover"
            />
          </div>
          <button
            type="button"
            class="absolute top-2 right-2 bg-black/50 rounded-full p-1 hover:bg-black/70 transition-colors"
            @click="$emit('close')"
          >
            <IconClose class="h-5 w-5 text-white" />
          </button>
          <slot name="portrait-overlay" />
        </div>
        <div class="p-4 overflow-y-auto space-y-4">
          <slot />
        </div>
        <slot name="footer" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { IconClose } from "@/lib/icons";

type FocalPoint = { x: number; y: number } | null | undefined;

const {
  open,
  portraitSrc,
  portraitAlt,
  focalPoint,
  placeholder,
  maxWidth = "md",
  portraitHeight = "72",
} = defineProps<{
  open: boolean;
  portraitSrc?: string | null;
  portraitAlt?: string;
  focalPoint?: FocalPoint;
  placeholder?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  portraitHeight?: "48" | "72";
}>();

defineEmits<{ close: [] }>();

const maxWidthClass = computed(() => `max-w-${maxWidth}`);
const portraitHeightClass = computed(() => `h-${portraitHeight}`);
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
