<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Spellcasting</h2>
      <label class="flex items-center gap-2 cursor-pointer">
        <span class="font-cinzel text-xs text-muted-foreground">{{ isSpellcaster ? 'On' : 'Off' }}</span>
        <button
          type="button"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
          :class="isSpellcaster ? 'bg-primary' : 'bg-muted'"
          @click="emit('update:isSpellcaster', !isSpellcaster)"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform"
            :class="isSpellcaster ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>
      </label>
    </div>

    <template v-if="isSpellcaster">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Caster type -->
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">CASTER TYPE</label>
          <div class="flex flex-wrap gap-3">
            <label v-for="opt in CASTER_TYPE_OPTIONS" :key="opt.value" class="flex items-center gap-1.5 cursor-pointer font-fell text-sm text-foreground">
              <input type="radio" :checked="casterType === opt.value" :value="opt.value" class="accent-primary" @change="emit('update:casterType', opt.value)" /> {{ opt.label }}
            </label>
          </div>
        </div>

        <!-- Slot recovery -->
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">SLOT RECOVERY</label>
          <div class="flex gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer font-fell text-sm text-foreground">
              <input type="radio" :checked="slotRecovery === 'long'" value="long" class="accent-primary" @change="emit('update:slotRecovery', 'long')" /> Long rest
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer font-fell text-sm text-foreground">
              <input type="radio" :checked="slotRecovery === 'short'" value="short" class="accent-primary" @change="emit('update:slotRecovery', 'short')" /> Short rest
            </label>
          </div>
        </div>

        <!-- Spells known toggle -->
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">SPELLS KNOWN TABLE</label>
          <label class="flex items-center gap-2 cursor-pointer font-fell text-sm text-foreground">
            <input type="checkbox" :checked="spellsKnown !== null" class="accent-primary" @change="onToggleSpellsKnown" />
            Known caster (Bard, Ranger, Sorcerer, Warlock style)
          </label>
        </div>

        <!-- Cantrips known toggle -->
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">CANTRIPS KNOWN TABLE</label>
          <label class="flex items-center gap-2 cursor-pointer font-fell text-sm text-foreground">
            <input type="checkbox" :checked="cantripsKnown !== null" class="accent-primary" @change="onToggleCantripsKnown" />
            Track cantrips known per level
          </label>
        </div>

        <!-- Prepared spell formula (only for prepared/spellbook) -->
        <template v-if="casterType === 'prepared' || casterType === 'spellbook'">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">PREPARED SPELL ABILITY</label>
            <div class="flex gap-3">
              <label v-for="ab in PREPARED_ABILITY_OPTIONS" :key="ab.value" class="flex items-center gap-1.5 cursor-pointer font-fell text-sm text-foreground">
                <input type="radio" :checked="preparedAbility === ab.value" :value="ab.value" class="accent-primary" @change="emit('update:preparedAbility', ab.value)" /> {{ ab.label }}
              </label>
            </div>
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">PREPARED SPELL SCALING</label>
            <div class="flex gap-3">
              <label class="flex items-center gap-1.5 cursor-pointer font-fell text-sm text-foreground">
                <input type="radio" :checked="preparedDivisor === 1" :value="1" class="accent-primary" @change="emit('update:preparedDivisor', 1)" /> Full level (Cleric, Druid, Wizard)
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer font-fell text-sm text-foreground">
                <input type="radio" :checked="preparedDivisor === 2" :value="2" class="accent-primary" @change="emit('update:preparedDivisor', 2)" /> Half level (Paladin, Artificer)
              </label>
            </div>
          </div>
        </template>
      </div>

      <!-- Spell slot grid: 20 rows × 9 columns -->
      <div class="overflow-x-auto">
        <table class="w-full text-center border-collapse">
          <thead>
            <tr>
              <th class="font-cinzel text-[9px] tracking-widest text-muted-foreground pb-1.5 pr-2 text-left w-8">LVL</th>
              <th v-for="sl in 9" :key="sl" class="font-cinzel text-[9px] tracking-widest text-muted-foreground pb-1.5 w-10">{{ sl }}</th>
              <th v-if="spellsKnown !== null" class="font-cinzel text-[9px] tracking-widest text-muted-foreground pb-1.5 w-12 pl-2">KNOWN</th>
              <th v-if="cantripsKnown !== null" class="font-cinzel text-[9px] tracking-widest text-muted-foreground pb-1.5 w-12 pl-2">CANTRIPS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="lvl in 20" :key="lvl" class="border-t border-border/40">
              <td class="font-cinzel text-[10px] text-primary pr-2 text-left py-0.5">{{ lvl }}</td>
              <td v-for="sl in 9" :key="sl" class="py-0.5 px-0.5">
                <input
                  :value="(spellSlots[lvl - 1] ?? [])[sl - 1] ?? 0"
                  type="number"
                  min="0"
                  max="9"
                  class="w-9 bg-muted/40 border border-border rounded px-1 py-0.5 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  @input="onSetSlot(lvl - 1, sl - 1, ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </td>
              <td v-if="spellsKnown !== null" class="py-0.5 pl-2">
                <input
                  :value="(spellsKnown ?? [])[lvl - 1] ?? 0"
                  type="number"
                  min="0"
                  class="w-10 bg-muted/40 border border-border rounded px-1 py-0.5 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  @input="onSetSpellsKnown(lvl - 1, ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </td>
              <td v-if="cantripsKnown !== null" class="py-0.5 pl-2">
                <input
                  :value="(cantripsKnown ?? [])[lvl - 1] ?? 0"
                  type="number"
                  min="0"
                  class="w-10 bg-muted/40 border border-border rounded px-1 py-0.5 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  @input="onSetCantripsKnown(lvl - 1, ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="font-fell text-xs text-muted-foreground">
        Enter the number of spell slots per spell level (columns 1–9) at each class level (rows 1–20). Leave as 0 where none are granted.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { CasterType, PreparedAbility } from "@/levelup/customTypes";

const CASTER_TYPE_OPTIONS = [
  { value: "prepared" as CasterType, label: "Prepared (Cleric, Druid)" },
  { value: "spellbook" as CasterType, label: "Spellbook (Wizard)" },
  { value: "known"    as CasterType, label: "Known (Bard, Sorcerer, Warlock)" },
] as const;

const PREPARED_ABILITY_OPTIONS = [
  { value: "wis" as PreparedAbility, label: "Wisdom" },
  { value: "int" as PreparedAbility, label: "Intelligence" },
  { value: "cha" as PreparedAbility, label: "Charisma" },
] as const;

const {
  isSpellcaster,
  spellSlots,
  spellsKnown,
  cantripsKnown,
  slotRecovery,
  casterType,
  preparedAbility,
  preparedDivisor,
} = defineProps<{
  isSpellcaster: boolean;
  spellSlots: number[][];
  spellsKnown: number[] | null;
  cantripsKnown: number[] | null;
  slotRecovery: "short" | "long";
  casterType: CasterType;
  preparedAbility: PreparedAbility | null;
  preparedDivisor: number | null;
}>();

const emit = defineEmits<{
  "update:isSpellcaster": [value: boolean];
  "update:spellSlots": [value: number[][]];
  "update:spellsKnown": [value: number[] | null];
  "update:cantripsKnown": [value: number[] | null];
  "update:slotRecovery": [value: "short" | "long"];
  "update:casterType": [value: CasterType];
  "update:preparedAbility": [value: PreparedAbility];
  "update:preparedDivisor": [value: number];
}>();

function onToggleSpellsKnown(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  emit("update:spellsKnown", checked ? Array(20).fill(0) : null);
}

function onToggleCantripsKnown(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  emit("update:cantripsKnown", checked ? Array(20).fill(0) : null);
}

function onSetSlot(levelIdx: number, slotLevelIdx: number, value: number) {
  const grid = spellSlots.map(row => [...row]);
  if (!grid[levelIdx]) grid[levelIdx] = Array(9).fill(0);
  grid[levelIdx][slotLevelIdx] = isNaN(value) ? 0 : value;
  emit("update:spellSlots", grid);
}

function onSetSpellsKnown(levelIdx: number, value: number) {
  const arr = [...(spellsKnown ?? Array(20).fill(0))];
  arr[levelIdx] = isNaN(value) ? 0 : value;
  emit("update:spellsKnown", arr);
}

function onSetCantripsKnown(levelIdx: number, value: number) {
  const arr = [...(cantripsKnown ?? Array(20).fill(0))];
  arr[levelIdx] = isNaN(value) ? 0 : value;
  emit("update:cantripsKnown", arr);
}
</script>
