import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import { levelUpAction, readyToLevelUp } from "@/rules/levelReadiness";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { PartyMember } from "@/types/party.types";

/**
 * Whether a character may level up now, and which Level Up its viewer is offered (#1021 row 27): by XP with the
 * Experience Points rule, otherwise by the party level a milestone raised. One wiring for every surface that shows a
 * character (the sheet's header, the AI table's sheet), so they cannot disagree.
 */
export function useLevelUp(member: MaybeRefOrGetter<PartyMember>, hidePlayerActions: MaybeRefOrGetter<boolean> = false) {
  const campaignStore = useCampaignStore();
  const auth = useAuthStore();
  const xpLevelling = useIsRuleEnabled("xp_levelling");

  /** The party level, read only on the character's own campaign. */
  const partyLevel = computed(() => {
    const campaign = campaignStore.activeCampaign;
    return campaign && toValue(member).campaign_id === campaign.id ? campaign.party_level : null;
  });
  const ready = computed(() => {
    const m = toValue(member);
    return readyToLevelUp({
      mode: xpLevelling.value ? "experience" : "milestone",
      level: m.level,
      experiencePoints: m.experience_points,
      partyLevel: partyLevel.value,
    });
  });
  const action = computed(() =>
    levelUpAction({
      ready: ready.value,
      viewerIsDm: auth.isDM,
      viewerId: auth.user?.id ?? null,
      member: toValue(member),
      hidePlayerActions: toValue(hidePlayerActions),
    }),
  );
  return { xpLevelling, ready, action };
}
