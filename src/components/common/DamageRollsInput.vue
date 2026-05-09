<template>
  <div class="flex flex-col gap-2">
    <!-- Rows -->
    <div v-for="(row, i) in rows" :key="i" class="flex items-center gap-2">
      <!-- Dice -->
      <input
        :value="row.dice"
        placeholder="2d6"
        class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-24 shrink-0"
        @input="updateRow(i, 'dice', ($event.target as HTMLInputElement).value)"
      />
      <!-- Type -->
      <select
        :value="row.type"
        class="bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize flex-1 min-w-0"
        @change="updateRow(i, 'type', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">— untyped —</option>
        <option v-for="t in DAMAGE_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
      </select>
      <!-- Remove -->
      <button
        type="button"
        class="text-muted-foreground hover:text-destructive transition-colors shrink-0 leading-none text-lg"
        @click="removeRow(i)"
      >
        ×
      </button>
    </div>

    <!-- Avg + Add row -->
    <div class="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground tracking-wider transition-colors"
        @click="addRow"
      >
        + Add damage
      </button>
      <span v-if="totalAvg > 0" class="font-fell text-[11px] text-muted-foreground">
        Avg: {{ Math.round(totalAvg) }}
      </span>
    </div>

    <!-- Quick-parse expression -->
    <div class="flex gap-2 items-center mt-1">
      <input
        v-model="parseInput"
        :placeholder="parsePlaceholder"
        class="bg-muted/60 border border-border/60 rounded-md px-3 py-1.5 font-fell text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring flex-1"
        @keydown.enter.prevent="parseAndApply"
      />
      <button
        type="button"
        class="font-cinzel text-[10px] text-primary hover:opacity-80 tracking-wider transition-opacity shrink-0"
        @click="parseAndApply"
      >
        Parse →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { DAMAGE_TYPES } from "@/types/damage.types";
import { parseDiceAvg, parseDamageExpression, type DamageRoll } from "@/lib/dice";

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
