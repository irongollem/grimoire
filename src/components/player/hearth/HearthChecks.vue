<template>
  <HearthSection title="Checks">
    <template #end>
      <span class="text-label italic text-muted-foreground">Tap to roll · hold for advantage</span>
    </template>
    <div class="torn bg-card border rounded-lg overflow-hidden">
      <AbilityScoreTable
        layout="sheet"
        :scores="effectiveScores"
        :saves="saves"
        :roll-mode-picker="true"
        @roll-ability="rollAbility"
        @roll-save="rollSave"
      />
      <div class="border-t border-border px-3 pt-2.5 pb-2">
        <p class="hearth-skills-label">Skills</p>
        <SkillRollList
          density="compact"
          :member="member"
          :override-scores="overrideScores"
          :check-disadvantage="checkDisadvantage"
          :check-penalty="exhaustionD20Penalty"
          @roll="onChildRoll"
        />
      </div>
    </div>
    <RollToast :result="lastRoll" />
  </HearthSection>
</template>

<script setup lang="ts">
import HearthSection from "./HearthSection.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import RollToast from "@/components/common/RollToast.vue";
import SkillRollList from "@/components/player/SkillRollList.vue";
import { useCharacterRolls } from "@/composables/party/useCharacterRolls";
import type { PartyMember } from "@/types/party.types";

/**
 * Ability checks, saves and the eighteen skills at the table. Every roll goes
 * through `useCharacterRolls` and `SkillRollList`, the character sheet's own
 * paths, so Wild Shape scores, conditions, Exhaustion, roll modes and immersive
 * whispered rolls behave exactly as they do there. Attacks stay on the
 * encounter page and spells on the Spellbook.
 */
const { member } = defineProps<{ member: PartyMember }>();

const {
  effectiveScores,
  overrideScores,
  saves,
  checkDisadvantage,
  exhaustionD20Penalty,
  lastRoll,
  onChildRoll,
  rollAbility,
  rollSave,
} = useCharacterRolls(() => member);
</script>

<style scoped>
/* The same small-capital voice as the section rubric, quieter. */
.hearth-skills-label {
  margin: 0 0 0.25rem;
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
</style>
