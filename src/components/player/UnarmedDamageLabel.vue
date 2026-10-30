<template>
  <span>{{ unarmedDamageText(damage) }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { abilityMod } from "@/rules/armorClass";
import { unarmedDamageBase, unarmedDamageText } from "@/rules/features/damageRoll";
import type { PartyMember } from "@/types/party.types";

/**
 * What an Unarmed Strike deals, as the number on the Combat tab's Damage button:
 * 1 + Strength, or the Martial Arts die with the better of Strength and Dexterity.
 * Reads the same rule the damage roll does, so the button and the roll agree.
 */
const { member, martialArtsDie } = defineProps<{
  member: PartyMember;
  /** The Martial Arts die the character's features grant, or null (`martialArtsDieOf`). */
  martialArtsDie: string | null;
}>();

const damage = computed(() =>
  unarmedDamageBase({
    strMod: abilityMod(member.str),
    dexMod: abilityMod(member.dex),
    martialArtsDie,
  }),
);
</script>
