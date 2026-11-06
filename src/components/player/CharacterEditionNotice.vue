<template>
  <p v-if="tableEdition && campaign.allows_mixed_rulesets" class="text-caption text-muted-foreground italic" data-testid="edition-info">
    Built with the {{ rulesetRules(member.ruleset) }}. This table plays the {{ rulesetRules(tableEdition) }} and takes both.
  </p>

  <CautionNotice
    v-else-if="tableEdition"
    class="flex flex-col gap-2"
    data-testid="edition-caution"
  >
    <p>
      {{ campaign.name }} now plays the {{ rulesetRules(tableEdition) }}. {{ member.name }} is built with the
      {{ rulesetRules(member.ruleset) }} and keeps their seat.
      <template v-if="!canConvert">{{ member.owner_user_id === null ? "The DM" : "Its player" }} can convert it.</template>
    </p>
    <div v-if="canConvert">
      <AppButton
        variant="subtle"
        size="xs"
        :label="`Convert to the ${rulesetRules(tableEdition)}`"
        :loading="converting"
        @click="convert"
      />
    </div>
  </CautionNotice>
</template>

<script setup lang="ts">
/**
 * Says that a seated character's edition differs from its table's (#943). A
 * table changing edition never unseats anyone, so this is how the owner finds
 * out, and how they convert in place (a copy would lose the seat and the gear).
 * Informational only when the table takes both editions.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CautionNotice from "@/components/common/feedback/CautionNotice.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { rulesetRules, rulesetYear, useConvertCharacterRuleset } from "@/composables/party/useCharacterRuleset";
import { useAuthStore } from "@/stores/auth";
import type { PartyMember } from "@/types/party.types";
import type { Campaign } from "@/types/campaign.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { gameSystemEdition } from "@/systems/registry";

const { member, campaign } = defineProps<{
  member: PartyMember;
  campaign: Pick<Campaign, "id" | "name" | "game_system" | "allows_mixed_rulesets">;
}>();

const auth = useAuthStore();
const { confirm } = useConfirm();
const toast = useToast();
const { mutateAsync: convertInPlace, isPending: converting } = useConvertCharacterRuleset();

// The edition the table plays when it differs from the character's; null when they
// match, and when the table's system has no edition at all (a Generic table seats
// no 5e character, so there is nothing to compare or convert).
const tableEdition = computed<RulesetKey | null>(() => {
  const edition = gameSystemEdition(campaign.game_system);
  return edition !== undefined && edition !== member.ruleset ? edition : null;
});

// The database lets the owner convert. A character nobody owns is converted by
// whoever made it or by the DM of the table it sits at (the active campaign:
// that is where this notice is shown). A DM does not convert a player's own
// character.
const canConvert = computed(() => {
  const userId = auth.user?.id;
  if (!userId) return false;
  if (member.owner_user_id !== null) return member.owner_user_id === userId;
  return member.user_id === userId || auth.isDM;
});

async function convert() {
  const edition = tableEdition.value;
  if (!edition) return;
  const ok = await confirm(
    `${member.name} itself will be changed to the ${rulesetRules(edition)}. Their classes and spells move to their ${rulesetYear(edition)} versions, and anything without one is kept and flagged for you to review. You can convert back later, but anything flagged now stays flagged.`,
    { title: `Convert to the ${rulesetRules(edition)}?`, confirmLabel: "Convert", danger: true },
  );
  if (!ok) return;
  try {
    await convertInPlace({ partyMemberId: member.id, ruleset: edition });
    toast.success(`${member.name} now uses the ${rulesetRules(edition)}.`);
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}
</script>
