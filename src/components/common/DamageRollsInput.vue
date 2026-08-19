<template>
  <div class="flex flex-col gap-2">
    <!-- Rows -->
    <div v-for="(row, i) in rows" :key="i" class="flex items-center gap-2">
      <!-- Dice -->
      <AppInput
        :model-value="row.dice"
        placeholder="2d6"
        tone="filled"
        size="body"
        :block="false"
        class="w-24 shrink-0"
        @update:model-value="(v) => updateRow(i, 'dice', v)"
      />
      <!-- Type -->
      <AppSelect
        :model-value="row.type"
        tone="filled"
        size="body"
        weight="normal"
        class="capitalize flex-1 min-w-0"
        @update:model-value="(v) => updateRow(i, 'type', v ?? '')"
      >
        <option value="">— untyped —</option>
        <option v-for="t in DAMAGE_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
      </AppSelect>
      <!-- Remove -->
      <AppButton
        variant="ghost"
        tone="danger"
        size="inline-xs"
        class="text-lg leading-none shrink-0"
        @click="removeRow(i)"
      >
        ×
      </AppButton>
    </div>

    <!-- Avg + Add row -->
    <div class="flex items-center gap-3 flex-wrap">
      <AppButton
        variant="ghost"
        size="inline-xs"
        label="+ Add damage"
        @click="addRow"
      />
      <span v-if="totalAvg > 0" class="text-caption text-muted-foreground">
        Avg: {{ Math.round(totalAvg) }}
      </span>
    </div>

    <!-- Quick-parse expression -->
    <div class="flex gap-2 items-center mt-1">
      <AppInput
        v-model="parseInput"
        :placeholder="parsePlaceholder"
        tone="filled"
        size="caption"
        :block="false"
        class="flex-1"
        @keydown.enter.prevent="parseAndApply"
      />
      <AppButton
        variant="link"
        size="inline-xs"
        class="shrink-0"
        label="Parse →"
        @click="parseAndApply"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { DAMAGE_TYPES } from "@/types/damage.types";
import { parseDiceAvg, parseDamageExpression, type DamageRoll } from "@/lib/dice/dice";

const SCHOOL_HINTS: Record<string, string> = {
  evocation: "e.g. 8d6 fire + 2d6 thunder…",
  necromancy: "e.g. 3d6 necrotic…",
  conjuration: "e.g. 3d6 acid…",
  illusion: "e.g. 2d6 psychic…",
  enchantment: "e.g. 1d6 psychic…",
  transmutation: "e.g. 2d6 acid…",
  abjuration: "e.g. 2d6 force…",
  divination: "e.g. 2d6 radiant…",
};

const model = defineModel<DamageRoll[]>({ required: true });
const { school } = defineProps<{
  school?: string;
}>();

const rows = computed(() => model.value);
const parseInput = ref("");

const parsePlaceholder = computed(
  () => (school && SCHOOL_HINTS[school]) ?? "e.g. 2d6 fire + 1d6 slashing…",
);

const totalAvg = computed(() => model.value.reduce((sum, r) => sum + parseDiceAvg(r.dice), 0));

function updateRow(i: number, field: "dice" | "type", value: string) {
  model.value = model.value.map((r, idx) => (idx === i ? { ...r, [field]: value } : r));
}

function addRow() {
  model.value = [...model.value, { dice: "", type: "" }];
}

function removeRow(i: number) {
  model.value = model.value.filter((_, idx) => idx !== i);
}

function parseAndApply() {
  const parsed = parseDamageExpression(parseInput.value);
  if (parsed.length === 0) return;
  model.value = [...model.value, ...parsed];
  parseInput.value = "";
}
</script>
