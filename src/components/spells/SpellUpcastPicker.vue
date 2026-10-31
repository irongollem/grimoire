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
            <span>{{ ordinal(slot.level) }}</span>
            <span class="text-caption-sm font-normal opacity-70">{{ poolLabel(slot) }}</span>
            <span class="text-caption-sm font-normal opacity-70">{{ slot.max - slot.used }} of {{ slot.max }} left</span>
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
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import { SCHOOL_BG } from "@/types/spell.types";
import { scaleExpression } from "@/lib/dice/dice";
import { castDamageRolls } from "@/rules/spellDamageScaling";
import { spellSlotKey, slotPool } from "@/rules/spellSlots";
import type { CharacterSpellEntry } from "@/types/spell.types";
import type { SpellSlotEntry } from "@/types/party.types";
import { ordinal } from "@/lib/ordinal";

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
  // Every damage part, scaled the way the cast rolls it: a two-part spell (Ice Storm)
  // grows only the part its upcast names, so the label must show both.
  if (entry.spell.damage_rolls?.length && (extra === 0 || entry.spell.higher_level_damage)) {
    // The picker only upcasts levelled spells, so the caster level (a cantrip's step) plays no part.
    return castDamageRolls(entry.spell, castLevel, 1).map((roll) => roll.dice).join(" + ");
  }
  if (extra === 0) return entry.spell.healing_dice ? entry.spell.healing_dice : "";
  if (entry.spell.higher_level_healing && entry.spell.healing_dice) {
    return scaleExpression(entry.spell.healing_dice, extra, entry.spell.higher_level_healing);
  }
  return "";
}
</script>
