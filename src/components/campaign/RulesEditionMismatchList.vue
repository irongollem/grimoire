<template>
  <!--
    The characters seated here that were built with the other edition (#943).
    Switching a table's edition changes nobody's character, so after a switch
    this is where the DM sees who no longer matches. Only a character nobody owns
    can be converted from here; an owned one is converted by its player.
  -->
  <section class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="text-heading-sm font-semibold text-foreground">Characters on the other edition</h2>
      <p v-if="allowsMixed" class="text-caption text-muted-foreground mt-1">
        This table allows both editions, so this list is for information and nothing needs doing.
      </p>
      <p v-else class="text-caption text-muted-foreground mt-1">
        These characters keep their seat and their edition until they are converted.
      </p>
    </div>
    <ul class="space-y-2">
      <li
        v-for="character in characters"
        :key="character.id"
        class="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2"
      >
        <div class="min-w-0 flex-1">
          <p class="font-cinzel text-xs font-semibold text-foreground truncate">{{ character.name }}</p>
          <p class="text-caption text-muted-foreground">Built with the {{ rulesetRules(character.ruleset) }}</p>
        </div>
        <AppButton
          v-if="character.owner_user_id === null"
          variant="subtle"
          size="sm"
          :label="`Convert to the ${rulesetRules(campaignRuleset)}`"
          :disabled="convert.isPending.value"
          @click="convertCharacter(character)"
        />
        <p v-else class="text-caption text-muted-foreground italic">Its player converts this character.</p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import { rulesetRules, rulesetYear, useConvertCharacterRuleset } from "@/composables/party/useCharacterRuleset";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import type { PartyMember } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";

const { characters, campaignRuleset, allowsMixed } = defineProps<{
  characters: PartyMember[];
  campaignRuleset: RulesetKey;
  allowsMixed: boolean;
}>();

const convert = useConvertCharacterRuleset();
const { confirm } = useConfirm();
const toast = useToast();

async function convertCharacter(character: PartyMember) {
  const rules = rulesetRules(campaignRuleset);
  const ok = await confirm(
    `${character.name} itself is changed to the ${rules}. Classes and spells move to their ${rulesetYear(campaignRuleset)} counterparts; anything without one is kept and flagged for review.`,
    { title: `Convert ${character.name} to the ${rules}?`, confirmLabel: "Convert", danger: false },
  );
  if (!ok) return;
  try {
    await convert.mutateAsync({ partyMemberId: character.id, ruleset: campaignRuleset });
    toast.success(`${character.name} now plays the ${rules}.`);
  } catch (error) {
    toast.error(toast.fromError(error));
  }
}
</script>
