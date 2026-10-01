import { computed, ref, watch, type MaybeRefOrGetter, toValue } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { provideCharacterRuleset, provideRuleset, type RulesetScopeMember } from "@/composables/rules/useRuleset";
import { creationLandingCampaign, initialCreationRuleset } from "@/composables/party/characterCreationEdition";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * The edition state of the character wizard (#943): which table the character
 * will land at, the edition chosen for it, and the ruleset scope every list in
 * the form reads. Split out of `useCharacterCreationForm` so the form keeps its
 * own concerns; behaviour is unchanged.
 *
 * CALL IT BEFORE any list composable (species, backgrounds, classes). Those read
 * the scope this provides, and a getter that reads something declared after the
 * call is a temporal-dead-zone error, so everything in `opts` must already exist
 * at the call site.
 */
export function useCharacterCreationEdition(opts: {
  isEditMode: MaybeRefOrGetter<boolean>;
  isDmCreate: MaybeRefOrGetter<boolean>;
  /** The character being edited, for the edit-mode scope. */
  existingMember: MaybeRefOrGetter<RulesetScopeMember | null | undefined>;
  /** Whether the creator sits at the active campaign. Their membership loads after setup. */
  isMemberOfActiveCampaign: MaybeRefOrGetter<boolean>;
}) {
  const campaign = useCampaignStore();

  const landingCampaign = computed(() => creationLandingCampaign({
    isDmCreate: toValue(opts.isDmCreate),
    activeCampaign: campaign.activeCampaign,
    isMemberOfActiveCampaign: toValue(opts.isMemberOfActiveCampaign),
  }));
  const chosenRuleset = ref<RulesetKey | null>(
    toValue(opts.isEditMode) ? null : initialCreationRuleset(landingCampaign.value),
  );
  let editionTouched = false;
  function chooseRuleset(next: RulesetKey) {
    editionTouched = true;
    chosenRuleset.value = next;
  }
  // The campaign's members load after setup, so a player's table may only become
  // known once the wizard is open; seed the edition then, but never over a choice.
  watch(landingCampaign, (landing) => {
    if (toValue(opts.isEditMode) || editionTouched || chosenRuleset.value !== null) return;
    chosenRuleset.value = initialCreationRuleset(landing);
  });

  // Species, background and class are all edition-specific, so a different
  // edition invalidates them. The reset needs form fields declared after this
  // call, so the form registers it with `onEditionChange` once they exist.
  // Synchronous on purpose: the lists re-key on the new edition asynchronously,
  // and the old species must still be resolvable in the callback to take back
  // the languages and speed it granted.
  let resetForEditionChange: (() => void) | null = null;
  function onEditionChange(reset: () => void) {
    resetForEditionChange = reset;
  }
  watch(chosenRuleset, (next, previous) => {
    if (toValue(opts.isEditMode) || next === null || previous === null || next === previous) return;
    resetForEditionChange?.();
  }, { flush: "sync" });

  if (toValue(opts.isEditMode)) provideCharacterRuleset(() => toValue(opts.existingMember));
  else provideRuleset(() => chosenRuleset.value);

  return { landingCampaign, chosenRuleset, chooseRuleset, onEditionChange };
}
