<template>
  <div class="flex flex-col items-center gap-1">
    <!-- Symbol -->
    <span class="font-cinzel text-[10px] font-bold tracking-wider" :class="color" :title="label">{{ symbol }}</span>

    <!-- Input -->
    <input
      v-model.number="local"
      type="number"
      min="0"
      class="w-full bg-muted/30 border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
      @change="commit"
      @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
    />

    <!-- ± buttons -->
    <div class="flex items-center gap-0.5">
      <button
        class="h-4 w-4 rounded flex items-center justify-center bg-muted/50 hover:bg-muted border border-border transition-colors"
        @click="adjust(-1)"
      ><IconMinus class="h-2 w-2" /></button>
      <button
        class="h-4 w-4 rounded flex items-center justify-center bg-muted/50 hover:bg-muted border border-border transition-colors"
        @click="adjust(1)"
      ><IconAdd class="h-2 w-2" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconAdd, IconMinus } from '@/lib/icons';

const props = defineProps<{ label: string; symbol: string; color: string; value: number }>();
const emit = defineEmits<{ commit: [value: number] }>();

const local = ref(props.value);

watch(() => props.value, (v) => { local.value = v; });

function adjust(delta: number) {
  local.value = Math.max(0, local.value + delta);
  commit();
}

function commit() {
  const v = Math.max(0, local.value || 0);
  local.value = v;
  emit("commit", v);
}
</script>
