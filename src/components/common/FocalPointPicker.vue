<template>
  <div class="space-y-2">
    <p
      class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground"
    >
      FOCAL POINT
      <span
        class="font-fell font-normal normal-case text-muted-foreground/60 ml-1"
      >
        — click image to set
      </span>
    </p>

    <!-- Image with crosshair overlay -->
    <div
      class="relative rounded overflow-hidden cursor-crosshair select-none"
      @click="onPick"
    >
      <img
        :src="src"
        alt=""
        class="w-full h-auto block pointer-events-none"
        draggable="false"
      />

      <!-- Crosshair dot at current focal point -->
      <div
        v-if="modelValue"
        class="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        :style="{ left: modelValue.x + '%', top: modelValue.y + '%' }"
      >
        <!-- Outer ring -->
        <div
          class="absolute inset-0 rounded-full border-2 border-white opacity-90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        />
        <!-- Centre dot -->
        <div class="absolute inset-1.25 rounded-full bg-white opacity-90" />
      </div>

      <!-- Placeholder hint when not yet set -->
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center bg-black/20"
      >
        <span class="font-fell text-xs text-white/70 italic"
          >Click to set focus</span
        >
      </div>
    </div>

    <!-- Clear button -->
    <button
      v-if="modelValue"
      type="button"
      class="text-xs font-cinzel tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      @click="$emit('update:modelValue', null)"
    >
      ✕ Clear (use smartcrop)
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  src: string;
  modelValue: { x: number; y: number } | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: { x: number; y: number } | null];
}>();

function onPick(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
  const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
  emit("update:modelValue", { x, y });
}
</script>
