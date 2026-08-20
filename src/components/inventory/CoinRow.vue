<template>
  <div class="flex flex-col items-center gap-1">
    <!-- Symbol -->
    <span class="text-label font-bold" :class="color" :title="label">{{ symbol }}</span>

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
      <AppButton
        variant="outline"
        surface="muted"
        fill="muted"
        size="icon-2xs"
        icon-size="xs"
        :icon="IconMinus"
        @click="adjust(-1)"
      />
      <AppButton
        variant="outline"
        surface="muted"
        fill="muted"
        size="icon-2xs"
        icon-size="xs"
        :icon="IconAdd"
        @click="adjust(1)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
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
