<template>
  <div class="flex flex-col items-center gap-1">
    <!-- Symbol -->
    <span class="text-label font-bold" :style="{ color }" :title="label">{{ symbol }}</span>

    <!-- Input: lazy, so a count is committed when the field is finished, not per keystroke -->
    <AppInput
      v-model.number.lazy="typed"
      type="number"
      min="0"
      size="heading"
      tone="muted"
      align="center"
      :aria-label="label"
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
        :aria-label="`Remove one ${label}`"
        @click="adjust(-1)"
      />
      <AppButton
        variant="outline"
        surface="muted"
        fill="muted"
        size="icon-2xs"
        icon-size="xs"
        :icon="IconAdd"
        :aria-label="`Add one ${label}`"
        @click="adjust(1)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconAdd, IconMinus } from '@/lib/icons';

const props = defineProps<{ label: string; symbol: string; /** `#rrggbb` of the denomination. */ color: string; value: number }>();
const emit = defineEmits<{
  /** A +/- click: the signed change, so the server adds it to the purse as it then is. */
  adjust: [delta: number];
  /** A typed count for this coin. */
  set: [count: number];
}>();

const local = ref(props.value);
const typed = ref(props.value);

watch(() => props.value, (v) => { local.value = v; typed.value = v; });

function adjust(delta: number) {
  // Never below zero: a click that cannot change the count sends nothing.
  if (local.value + delta < 0) return;
  local.value += delta;
  typed.value = local.value;
  emit("adjust", delta);
}

watch(typed, (v) => {
  if (v === local.value) return;
  // Coins are whole numbers, and never negative.
  const count = Math.max(0, Math.trunc(Number(v) || 0));
  local.value = count;
  typed.value = count;
  emit("set", count);
});
</script>
