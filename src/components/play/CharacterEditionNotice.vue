<template>
  <p v-if="mismatched && campaign.allows_mixed_rulesets" class="text-caption text-muted-foreground italic" data-testid="edition-info">
    Built with the {{ member.ruleset }} rules. This table plays {{ campaign.ruleset }} and takes both.
  </p>

  <div
    v-else-if="mismatched"
    class="rounded-md border border-tone-caution/40 bg-tone-caution/10 px-3 py-2 text-caption text-ink-caution flex flex-col gap-2"
    role="status"
    data-testid="edition-caution"
  >
    <p>
      {{ campaign.name }} now plays the {{ campaign.ruleset }} rules. {{ member.name }} is built with the
      {{ member.ruleset }} rules and keeps their seat.
      <template v-if="!canConvert">Its player can convert it.</template>
    </p>
    <div v-if="canConvert">
      <AppButton
        variant="subtle"
        size="xs"
        :label="`Convert to ${campaign.ruleset}`"
        :loading="converting"
        @click="convert"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Says that a seated character's edition differs from its table's (#943). A
 * table changing edition never unseats anyone, so this is how the owner finds
 * out, and how they convert in place (a copy would lose the seat and the gear).
 * Informational only when the table takes both editions.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useConvertCharacterRuleset } from "@/composables/party/useCharacterRuleset";
import { useAuthStore } from "@/stores/auth";
import type { PartyMember } from "@/types/party.types";
import type { Campaign } from "@/types/campaign.types";

const { member, campaign } = defineProps<{
  member: PartyMember;
  campaign: Pick<Campaign, "id" | "name" | "ruleset" | "allows_mixed_rulesets">;
}>();

const auth = useAuthStore();
const { confirm } = useConfirm();
const toast = useToast();
const { mutateAsync: convertInPlace, isPending: converting } = useConvertCharacterRuleset();

const mismatched = computed(() => member.ruleset !== campaign.ruleset);

// The owner converts; a character nobody owns is converted by whoever made it.
const canConvert = computed(() => {
  const userId = auth.user?.id;
  if (!userId) return false;
  if (member.owner_user_id !== null) return member.owner_user_id === userId;
  return member.user_id === userId;
});

async function convert() {
  const ok = await confirm(
    `${member.name} itself will be changed to the ${campaign.ruleset} rules. Their classes and spells move to their ${campaign.ruleset} versions, and anything without one is kept and flagged for you to review. This cannot be undone automatically.`,
    { title: `Convert to ${campaign.ruleset}?`, confirmLabel: "Convert", danger: true },
  );
  if (!ok) return;
  try {
    await convertInPlace({ partyMemberId: member.id, ruleset: campaign.ruleset });
    toast.success(`${member.name} now uses the ${campaign.ruleset} rules.`);
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}
</script>
