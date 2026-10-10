<template>
  <div class="flex items-center gap-1.5 flex-wrap">
    <AppButton
      as="span"
      variant="tinted"
      :tone="recharge === 'short' || recharge === 'turn' ? 'caution' : 'info'"
      emphasis="soft"
      size="xs"
      class="shrink-0"
      :label="RECHARGE_LABEL[recharge]"
    />

    <span v-if="remaining === 'unlimited'" class="text-label text-muted-foreground">Unlimited</span>

    <!-- A pool is spent in amounts (Lay on Hands, Ki, Sorcery Points). -->
    <template v-else-if="pool">
      <span class="text-heading-sm text-foreground shrink-0">{{ remaining }} / {{ max }}</span>
      <template v-if="!readonly">
        <template v-if="spending">
          <AppInput
            v-model.number="amount"
            type="number"
            size="xs"
            tone="muted"
            align="center"
            min="1"
            :max="remaining"
            class="w-14"
            :aria-label="`${label} to spend`"
          />
          <AppButton
            variant="subtle"
            size="sm"
            label="Spend"
            :disabled="!amountValid"
            @click="confirmSpend"
          />
          <AppButton variant="subtle" size="sm" label="Cancel" @click="spending = false" />
        </template>
        <template v-else>
          <AppButton variant="subtle" size="sm" label="Spend" :disabled="remaining <= 0" @click="openSpend" />
          <AppButton
            variant="subtle"
            size="icon-xs"
            label="+"
            :aria-label="`Restore one ${label}`"
            :disabled="remaining >= maxNumber"
            @click="emit('restore', 1)"
          />
        </template>
      </template>
    </template>

    <template v-else>
      <AppButton
        v-if="!readonly"
        variant="subtle"
        size="icon-xs"
        label="−"
        :aria-label="`Spend one ${label}`"
        :disabled="remaining <= 0"
        @click="emit('spend', 1)"
      />
      <span class="text-heading-sm text-foreground min-w-10 text-center">{{ remaining }} / {{ max }}</span>
      <AppButton
        v-if="!readonly"
        variant="subtle"
        size="icon-xs"
        label="+"
        :aria-label="`Restore one ${label}`"
        :disabled="remaining >= maxNumber"
        @click="emit('restore', 1)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import type { Recharge } from "@/rules/features/mechanics.types";

/**
 * A feature's uses (#976): pips for a count, an amount for a pool. Shared by
 * the Features tab and the encounter runner so both read and spend the same
 * way; the caller does the writing through `useFeatureUses`.
 */
const {
  label,
  remaining,
  max,
  recharge,
  pool,
  readonly = false,
} = defineProps<{
  label: string;
  remaining: number | "unlimited";
  max: number | "unlimited";
  recharge: Recharge;
  pool: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{ spend: [amount: number]; restore: [amount: number] }>();

const RECHARGE_LABEL: Record<Recharge, string> = {
  short: "Short rest",
  long: "Long rest",
  turn: "Each turn",
  dawn: "Dawn",
};

const maxNumber = computed(() => (max === "unlimited" ? Number.POSITIVE_INFINITY : max));

const spending = ref(false);
const amount = ref(1);
const amountValid = computed(
  () => remaining !== "unlimited" && Number.isInteger(amount.value) && amount.value >= 1 && amount.value <= remaining,
);

function openSpend() {
  amount.value = 1;
  spending.value = true;
}

function confirmSpend() {
  if (!amountValid.value) return;
  emit("spend", amount.value);
  spending.value = false;
}
</script>
