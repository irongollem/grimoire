<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">Resources</p>
    </div>
    <div class="divide-y divide-border">
      <div
        v-for="res in resources"
        :key="res.key"
        class="flex items-center gap-2 px-4 py-2.5 flex-wrap"
      >
        <span class="text-body text-foreground flex-1">{{ res.label }}</span>
        <span
          class="text-label rounded px-1.5 py-0.5 shrink-0"
          :class="res.rest === 'short'
            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
            : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'"
        >{{ res.rest === "short" ? "Short" : "Long" }}</span>

        <!-- Variable-spend: Lay on Hands -->
        <template v-if="res.key === 'lay_on_hands'">
          <span class="font-cinzel text-sm text-foreground shrink-0">{{ res.current }} / {{ res.max }}</span>
          <template v-if="pendingSpendKey === res.key">
            <AppInput
              v-model.number="pendingSpendAmount"
              type="number"
              size="xs"
              tone="muted"
              align="center"
              min="1"
              :max="res.current"
              class="w-14"
            />
            <span class="text-caption text-muted-foreground shrink-0">HP</span>
            <button
              class="h-6 px-2 rounded border border-border font-cinzel text-xs text-primary hover:border-primary/40 disabled:opacity-30 transition-colors"
              :disabled="pendingSpendAmount < 1 || pendingSpendAmount > res.current"
              @click="confirmSpend(res.key)"
            >✓</button>
            <AppButton variant="subtle" size="sm" label="✗" @click="cancelSpend" />
          </template>
          <template v-else>
            <AppButton
              variant="subtle"
              size="sm"
              label="Spend"
              :disabled="res.current <= 0"
              @click="openSpendInput(res.key)"
            />
            <AppButton
              variant="subtle"
              size="icon-xs"
              label="+"
              :disabled="res.current >= res.max"
              @click="emit('restore', res.key)"
            />
          </template>
        </template>

        <!-- Standard ±1 resource -->
        <div v-else class="flex items-center gap-1.5 shrink-0">
          <AppButton
            variant="subtle"
            size="icon-xs"
            label="−"
            :disabled="res.current <= 0"
            @click="emit('spend', res.key)"
          />
          <span class="font-cinzel text-sm text-foreground w-10 text-center">
            {{ res.current }} / {{ res.max }}
          </span>
          <AppButton
            variant="subtle"
            size="icon-xs"
            label="+"
            :disabled="res.current >= res.max"
            @click="emit('restore', res.key)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";

export interface ResourceRow {
  key: string;
  label: string;
  current: number;
  max: number;
  rest: "short" | "long";
}

const { resources } = defineProps<{ resources: ResourceRow[] }>();

const emit = defineEmits<{
  spend: [key: string];
  restore: [key: string];
  spendAmount: [key: string, amount: number];
}>();

const pendingSpendKey = ref<string | null>(null);
const pendingSpendAmount = ref<number>(1);

function openSpendInput(key: string) {
  pendingSpendKey.value = key;
  pendingSpendAmount.value = 1;
}

function cancelSpend() {
  pendingSpendKey.value = null;
  pendingSpendAmount.value = 1;
}

function confirmSpend(key: string) {
  if (!key) return;
  const res = resources.find(r => r.key === key);
  if (!res) return;
  const amount = Math.min(Math.max(1, pendingSpendAmount.value), res.current);
  emit("spendAmount", key, amount);
  cancelSpend();
}
</script>
