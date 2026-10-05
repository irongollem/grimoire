<template>
  <div class="block">
    <span class="field-label">Armor Class</span>
    <div class="rounded-lg border border-border bg-muted/30 p-3">
      <AcBreakdownList :breakdown="breakdown" />
    </div>
    <p class="mt-1 text-caption text-muted-foreground">
      Worked out from the armor in the Body slot, a shield in the Off hand and magic items worn. Change them in the inventory.
    </p>

    <label class="mt-3 block">
      <span class="field-label">Another way to work out AC</span>
      <div class="flex flex-wrap items-center gap-2">
        <AppSelect v-model="formulaType" tone="filled" size="body" weight="normal">
          <option value="">None</option>
          <option value="mage_armor">Mage Armor spell</option>
          <option value="natural">Natural armor</option>
          <option value="natural_dex">Natural armor plus Dexterity (Lizardfolk)</option>
          <option value="unarmored:dex+con">Unarmored Defense (Barbarian levels)</option>
          <option value="unarmored:dex+wis">Unarmored Defense (Monk levels)</option>
        </AppSelect>
        <AppInput
          v-if="formulaType === 'natural' || formulaType === 'natural_dex'"
          v-model.number="naturalBase"
          type="number"
          min="1"
          tone="filled"
          size="body"
          class="w-24"
          aria-label="Natural armor base AC"
        />
      </div>
      <span class="mt-1 block text-caption text-muted-foreground">
        Barbarians, Monks and Draconic Sorcerers get theirs from their class. Use this for a spell, a species trait or a second class. The best one counts.
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AcBreakdownList from "@/components/player/AcBreakdownList.vue";
import type { AcBreakdown } from "@/rules/armorClass";

const { breakdown, naturalSeed = null } = defineProps<{
  breakdown: AcBreakdown;
  /** The species' natural armor AC, to start the base number from. */
  naturalSeed?: number | null;
}>();

/** `ac_formula`: null, "mage_armor", "unarmored:dex+con", "unarmored:dex+wis", "natural:N" or "natural:N+dex". */
const formula = defineModel<string | null | undefined>({ required: true });

/** Select value: the formula itself, except that both natural forms collapse to a base-less key. */
const formulaType = computed({
  get(): string {
    const fm = formula.value;
    if (!fm) return "";
    if (fm.startsWith("natural:")) return fm.endsWith("+dex") ? "natural_dex" : "natural";
    return fm;
  },
  set(val: string) {
    if (val === "") formula.value = null;
    else if (val === "natural" || val === "natural_dex") {
      formula.value = `natural:${naturalSeed ?? 10}${val === "natural_dex" ? "+dex" : ""}`;
    } else formula.value = val;
  },
});

const naturalBase = computed({
  get(): number {
    const match = formula.value?.match(/^natural:(\d+)(\+dex)?$/);
    return match ? parseInt(match[1], 10) : (naturalSeed ?? 10);
  },
  set(val: number) {
    formula.value = `natural:${val}${formulaType.value === "natural_dex" ? "+dex" : ""}`;
  },
});
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
