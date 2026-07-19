<template>
  <Teleport to="body">
    <div v-if="entry" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60" @click="emit('cancel')" />
      <div class="relative z-10 w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl p-5 space-y-4">
        <!-- Header -->
        <div class="flex items-center gap-2">
          <div
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: SCHOOL_COLORS[entry.spell.school] }"
          />
          <h2 class="font-cinzel text-base font-bold text-foreground">{{ entry.spell.name }}</h2>
        </div>

        <!-- Slot level picker -->
        <div>
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-2">CAST AT LEVEL</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="lvl in upcastLevels"
              :key="lvl"
              class="flex flex-col items-center px-3 py-2 rounded-lg border font-cinzel text-xs font-semibold transition-colors"
              :class="selectedLevel === lvl
                ? 'bg-primary/15 border-primary text-primary'
                : 'bg-muted border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'"
              @click="selectedLevel = lvl"
            >
              <span>{{ SLOT_LEVEL_LABELS[lvl - 1] }}</span>
              <span v-if="scaledDiceLabel(lvl)" class="font-fell text-[10px] font-normal mt-0.5 opacity-80">
                {{ scaledDiceLabel(lvl) }}
              </span>
            </button>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-3 pt-1">
          <button
            type="button"
            class="flex-1 px-4 py-2 font-cinzel text-xs font-semibold border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
            @click="emit('cancel')"
          >Cancel</button>
          <button
            type="button"
            :disabled="isCasting"
            class="flex-1 px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="emit('cast', selectedLevel)"
          >
            {{ isCasting ? "Casting…" : "Cast" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from "vue";
import { SCHOOL_COLORS } from "@/types/spell.types";
import { scaleExpression } from "@/lib/dice";
import type { CharacterSpellEntry } from "@/types/spell.types";
import type { SpellSlotEntry } from "@/types/party.types";

const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

const { entry, spellSlots, isCasting = false } = defineProps<{
  entry: CharacterSpellEntry | null;
  spellSlots: SpellSlotEntry[];
  isCasting?: boolean;
}>();

const emit = defineEmits<{
  cast: [level: number];
  cancel: [];
}>();

const selectedLevel = ref(1);

const upcastLevels = computed(() => {
  if (!entry) return [];
  const base = entry.spell.level;
  return [...new Set(spellSlots
    .filter((s) => s.level >= base && s.used < s.max)
    .map((s) => s.level))]
    .sort((a, b) => a - b);
});

watchEffect(() => {
  if (entry) selectedLevel.value = upcastLevels.value[0] ?? entry.spell.level;
});

function scaledDiceLabel(castLevel: number): string {
  if (!entry) return "";
  const extra = castLevel - entry.spell.level;
  if (extra === 0) {
    if (entry.spell.damage_rolls?.length) return entry.spell.damage_rolls[0].dice;
    if (entry.spell.healing_dice) return entry.spell.healing_dice;
    return "";
  }
  if (entry.spell.higher_level_damage && entry.spell.damage_rolls?.length) {
    return scaleExpression(entry.spell.damage_rolls[0].dice, extra, entry.spell.higher_level_damage.dice_per_level);
  }
  if (entry.spell.higher_level_healing && entry.spell.healing_dice) {
    return scaleExpression(entry.spell.healing_dice, extra, entry.spell.higher_level_healing);
  }
  return "";
}
</script>
