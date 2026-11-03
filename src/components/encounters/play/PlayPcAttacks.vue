<template>
  <div class="flex flex-col gap-2" data-testid="turn-card-pc-attacks">
    <RunnerPcAttacks
      compact
      :member="member"
      :features="features"
      :prof-bonus="profBonus"
      :ability-mod="abilityMod"
      :sender-name="senderName"
      @roll-attack="rollAttack"
      @roll-damage="rollActionDamage"
      @damage-rolled="onPcDamageRolled"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import RunnerPcAttacks from "@/components/encounters/RunnerPcAttacks.vue";
import { useRunnerPcAttacks } from "@/composables/encounters/useRunnerPcAttacks";
import { useRunnerRolls } from "@/composables/encounters/useRunnerRolls";
import { provideCharacterRuleset } from "@/composables/rules/useRuleset";
import type { CheckMode } from "@/components/encounters/RunnerRollModeToggle.vue";
import type { PartyMember } from "@/types/party.types";

/**
 * A character's attacks on the Play turn card (#1125 frame 10), one line each with a Roll. It is the full sheet's own attack list, fed through
 * the same two composables, so a roll from here is the roll from the sheet: same prompt, same chat post.
 * The card has no roll toggles, so it rolls plain and public.
 */
const { member, senderName } = defineProps<{ member: PartyMember; senderName: string }>();

// A character built under the other edition must not read the campaign's ruleset.
provideCharacterRuleset(() => member);

const { features, profBonus, abilityMod } = useRunnerPcAttacks(() => member);
const { rollAttack, rollActionDamage, onPcDamageRolled } = useRunnerRolls({
  senderName: () => senderName,
  rollMode: ref<CheckMode>("normal"),
  silent: () => false,
});
</script>
