<template>
  <AppModal :open="!!entry" size="sm" align="sheet" :labelled-by="headingId" @close="emit('cancel')">
    <!-- Header. Hand-rolled rather than `ModalHeader`: the school marker is a
         colour swatch, not an icon in a tone circle, which is the one thing
         `ModalHeader` cannot express. -->
    <header v-if="entry" class="flex shrink-0 items-center gap-2 px-5 pt-5 pb-4">
      <div
        class="h-2.5 w-2.5 shrink-0 rounded-full"
        :class="SCHOOL_BG[entry.spell.school]"
      />
      <h2 :id="headingId" class="text-heading-sm font-bold text-foreground">{{ entry.spell.name }}</h2>
    </header>

    <!-- Slot level picker -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
      <p class="text-eyebrow font-semibold text-muted-foreground mb-2">CAST AT LEVEL</p>
      <div class="flex flex-wrap gap-2">
        <AppButton
          v-for="slot in upcastSlots"
          :key="spellSlotKey(slot)"
          variant="subtle"
          surface="muted"
          size="md"
          :active="selectedKey === spellSlotKey(slot)"
          @click="selectedKey = spellSlotKey(slot)"
        >
          <div class="flex flex-col items-center">
            <span>{{ SLOT_LEVEL_LABELS[slot.level - 1] }}</span>
            <span class="text-caption-sm font-normal opacity-70">{{ poolLabel(slot) }}</span>
            <span v-if="scaledDiceLabel(slot.level)" class="text-caption-sm font-normal mt-0.5 opacity-80">
              {{ scaledDiceLabel(slot.level) }}
            </span>
          </div>
        </AppButton>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex shrink-0 gap-3 px-5 pb-5">
      <AppButton variant="subtle" size="md" class="flex-1" label="Cancel" @click="emit('cancel')" />
      <AppButton
        variant="primary"
        size="md"
        class="flex-1"
        :disabled="isCasting"
        :label="isCasting ? 'Casting…' : 'Cast'"
        @click="selectedSlot && emit('cast', selectedSlot)"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, useId, watchEffect } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import { SCHOOL_BG } from "@/types/spell.types";
import { scaleExpression } from "@/lib/dice/dice";
import { spellSlotKey, slotPool } from "@/rules/spellSlots";
import type { CharacterSpellEntry } from "@/types/spell.types";
import type { SpellSlotEntry } from "@/types/party.types";

const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

const { entry, spellSlots, isCasting = false } = defineProps<{
  entry: CharacterSpellEntry | null;
  spellSlots: SpellSlotEntry[];
  isCasting?: boolean;
}>();

const emit = defineEmits<{
  cast: [slot: SpellSlotEntry];
  cancel: [];
}>();

const headingId = useId();
const selectedKey = ref("");

const upcastSlots = computed(() => {
  if (!entry) return [];
  const base = entry.spell.level;
  return spellSlots
    .filter((slot) => slot.level >= base && slot.used < slot.max)
    .sort((a, b) => a.level - b.level || slotPool(a).localeCompare(slotPool(b)));
});

const selectedSlot = computed(() =>
  upcastSlots.value.find(slot => spellSlotKey(slot) === selectedKey.value) ?? null,
);

watchEffect(() => {
  if (entry) selectedKey.value = upcastSlots.value[0] ? spellSlotKey(upcastSlots.value[0]) : "";
});

function poolLabel(slot: SpellSlotEntry): string {
  const pool = slotPool(slot);
  return pool === "pact" ? "Pact Magic"
    : pool === "spellcasting" ? "Spellcasting"
    : pool === "temporary" ? "Created Slot"
    : "Feature Slot";
}

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
