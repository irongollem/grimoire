<template>
  <Teleport to="body">
    <div
      v-if="src"
      class="fixed inset-0 z-200 flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
      @click="emit('close')"
    >
      <img
        :src="src"
        :alt="alt ?? ''"
        class="max-w-full max-h-full object-contain rounded shadow-2xl cursor-default"
        @click.stop
      />
      <button
        type="button"
        class="absolute top-4 right-4 rounded-full bg-black/40 p-1.5 text-white/70 hover:text-white transition-colors"
        @click="emit('close')"
      >
        <IconClose class="h-5 w-5" />
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onUnmounted, watch } from "vue";
import { IconClose } from '@/lib/icons';

const props = defineProps<{ src?: string | null; alt?: string }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

watch(
  () => props.src,
  (v) => {
    if (v) window.addEventListener("keydown", onKey);
    else window.removeEventListener("keydown", onKey);
  },
);

onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>
