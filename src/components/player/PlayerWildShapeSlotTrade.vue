<template>
  <div class="flex items-center gap-2">
    <AppSelect v-model="pickedKey" size="sm" class="min-w-0 flex-1" :aria-label="`${buttonLabel}: spell slot`">
      <option v-for="slot in slots" :key="spellSlotKey(slot)" :value="spellSlotKey(slot)">
        {{ poolLabel(slot) }} level {{ slot.level }} ({{ slot.max - slot.used }} left)
      </option>
    </AppSelect>
    <AppButton
      variant="tinted"
      size="sm"
      tone="success"
      emphasis="soft"
      :label="buttonLabel"
      :disabled="disabled || !picked"
      :loading="pending"
      @click="picked && emit('trade', picked)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { slotPool, spellSlotKey } from "@/rules/spellSlots";
import type { SpellSlotEntry } from "@/types/party.types";

// The slot picker shared by Wild Resurgence and Combat Wild Shape: choose one of
// the offered slots, press the button, and the parent runs the trade.
const { slots, buttonLabel, disabled = false, pending = false } = defineProps<{
  slots: SpellSlotEntry[];
  buttonLabel: string;
  disabled?: boolean;
  pending?: boolean;
}>();
const emit = defineEmits<{ (e: "trade", slot: SpellSlotEntry): void }>();

const pickedKey = ref("");
watchEffect(() => {
  if (!slots.some((slot) => spellSlotKey(slot) === pickedKey.value)) {
    pickedKey.value = slots[0] ? spellSlotKey(slots[0]) : "";
  }
});
const picked = computed(() => slots.find((slot) => spellSlotKey(slot) === pickedKey.value) ?? null);

function poolLabel(slot: SpellSlotEntry): string {
  const pool = slotPool(slot);
  if (pool === "pact") return "Pact";
  if (pool === "temporary") return "Created";
  return "Spell";
}
</script>
