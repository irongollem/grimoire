<template>
  <HearthSection v-if="hasSlots || concentration" title="Spellcasting">
    <div class="torn bg-card border rounded-lg flex flex-col gap-3 p-3.5">
      <div v-if="concentration" class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex min-w-0 flex-col">
          <span class="text-eyebrow text-muted-foreground">Concentrating</span>
          <span class="text-body font-semibold">{{ concentration.spellName }}</span>
        </div>
        <AppButton variant="tinted" tone="arcane" emphasis="soft" size="md" :loading="ending" label="End concentration" @click="drop" />
      </div>
      <PlayerSpellSlotStrip v-if="hasSlots" :spell-slots="member.spell_slots" @set-used="setSlotUsed" />
    </div>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import HearthSection from "./HearthSection.vue";
import AppButton from "@/components/common/AppButton.vue";
import PlayerSpellSlotStrip from "@/components/spells/PlayerSpellSlotStrip.vue";
import { useConcentration } from "@/composables/party/useConcentration";
import { useSpellSlotWrite } from "@/composables/spells/useSpellSlotWrite";
import type { PartyMember, SpellSlotEntry } from "@/types/party.types";

/**
 * Slots and the spell being held, read and spent at the table. Renders nothing
 * for a character with neither, so a fighter's Hearth has no empty box.
 */
const { member } = defineProps<{ member: PartyMember }>();

const { endConcentration } = useConcentration();
const { setSlotUsed: writeSlot } = useSpellSlotWrite();

const hasSlots = computed(() => member.spell_slots.length > 0);
const concentration = computed(() => member.concentration ?? null);
const ending = ref(false);

function setSlotUsed(slot: SpellSlotEntry, used: number) {
  return writeSlot(member, slot, used);
}

async function drop() {
  ending.value = true;
  try {
    await endConcentration(member, { reason: "dropped" });
  } finally {
    ending.value = false;
  }
}
</script>
