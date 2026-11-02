<template>
  <div
    class="grid grid-cols-2 gap-2 sm:[grid-template-columns:repeat(var(--coin-cols),minmax(0,1fr))]"
    :style="{ '--coin-cols': Math.min(cfg.denominations.length, 5) }"
  >
    <label
      v-for="d in cfg.denominations"
      :key="d.key"
      class="flex flex-col gap-0.5 text-caption font-semibold uppercase"
      :style="{ color: d.color }"
    >
      {{ d.abbr }}
      <AppInput
        :ref="(el) => setField(d.key, el)"
        :model-value="model?.[d.key] ?? 0"
        type="number"
        min="0"
        step="1"
        :size="size"
        :disabled="disabled"
        :aria-label="d.name"
        class="max-sm:min-h-11"
        @update:model-value="(raw) => onInput(d.key, raw)"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
/**
 * Edits a purse in the campaign's own coins (#934): one whole-number field per
 * denomination. Replaces the five-field pp/gp/ep/sp/cp grids. The model never
 * holds a zero entry, so an untouched purse stays `{}`.
 */
import { computed, unref, type ComponentPublicInstance, type MaybeRef } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import type { FieldSize } from "@/components/common/controls/fieldVariants";
import { useCurrency } from "@/composables/currency/useCurrency";
import type { Coins, CurrencyConfig } from "@/lib/currency/currency";

const model = defineModel<Coins>();
const { currency, size = "sm", disabled = false, max } = defineProps<{
  /** Overrides the active campaign's currency. */
  currency?: CurrencyConfig;
  size?: FieldSize;
  disabled?: boolean;
  /** Per-denomination cap, e.g. what the giver holds. */
  max?: Coins;
}>();

const active = useCurrency().currency;
const cfg = computed(() => currency ?? active.value);

// AppInput exposes its <input> as `el`; read it when needed, not when the ref
// callback runs (the element is not bound yet then).
type Field = { el: MaybeRef<HTMLInputElement | null> };
const fields = new Map<string, Field | null>();
function setField(key: string, instance: Element | ComponentPublicInstance | null) {
  fields.set(key, instance as Field | null);
}

function onInput(key: string, raw: string | number | null) {
  const cap = max?.[key];
  const typed = raw === null || raw === "" ? NaN : Number(raw);
  let n = Number.isFinite(typed) ? Math.max(0, Math.floor(typed)) : 0;
  if (cap !== undefined) n = Math.min(n, Math.max(0, Math.floor(cap)));

  // The DOM keeps what was typed ("-3", "2.5") when the clamped value equals
  // the model, so write the clamped one back. A cleared field stays cleared.
  const field = unref(fields.get(key)?.el);
  if (raw !== null && raw !== "" && field && field.value !== String(n)) field.value = String(n);

  const next: Coins = { ...model.value };
  if (n > 0) next[key] = n;
  else delete next[key];
  model.value = next;
}
</script>
