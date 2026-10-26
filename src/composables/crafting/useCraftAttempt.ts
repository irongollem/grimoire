import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useAttemptCraft } from "@/composables/crafting/useCrafting";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { getDiscipline } from "@/lib/crafting/disciplines";
import { craftChatMessage, outputDisplayNames } from "@/lib/crafting/craftMessage";
import { planConsumption, resolveItemName, rowDisplayName, type IngredientSlot } from "@/lib/crafting/ingredients";
import { isFineResult, qualityNote, spentQualityModifier, spentRows } from "@/lib/crafting/qualityRules";
import { inventoryItemRef } from "@/lib/itemRef";
import { reportHandledError } from "@/lib/observability/sentry";
import type {
  CraftingAttemptResult,
  CraftingModifier,
  CraftingOutput,
  CraftingRecipe,
} from "@/types/crafting.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";

export interface CraftAttemptInputs {
  recipe: MaybeRefOrGetter<CraftingRecipe>;
  outputs: MaybeRefOrGetter<readonly CraftingOutput[]>;
  slots: MaybeRefOrGetter<readonly IngredientSlot[]>;
  modifiers: MaybeRefOrGetter<readonly CraftingModifier[]>;
  member: MaybeRefOrGetter<PartyMember>;
  hasTools: MaybeRefOrGetter<boolean>;
  /** Without tool proficiency the proficiency bonus is not added. */
  hasProficiency: MaybeRefOrGetter<boolean>;
  workspaceBonus: MaybeRefOrGetter<number>;
  allItems: MaybeRefOrGetter<readonly Item[]>;
  itemNameMap?: MaybeRefOrGetter<ReadonlyMap<string, string> | undefined>;
}

/** The state and the one action of a craft attempt, independent of any view. */
export function useCraftAttempt(inputs: CraftAttemptInputs) {
  const { mutateAsync: attemptCraft } = useAttemptCraft();
  const { sendMessage } = useCampaignMessages();

  const result = ref<CraftingAttemptResult | null>(null);
  const attempting = ref(false);
  const attemptError = ref<string | null>(null);
  // The craft itself worked; only the chat post failed. Kept apart from attemptError
  // so it never reads as a failed craft that invites another attempt.
  const chatNotice = ref<string | null>(null);
  const selectedModifiers = ref<Set<number>>(new Set());
  const workspaceEnabled = ref(false);
  /** slot index → inventory row id the player chose to use first */
  const preferred = ref<Record<number, string>>({});

  const discipline = computed(() => getDiscipline(toValue(inputs.recipe).discipline));

  const abilityMod = computed(() => {
    const score = toValue(inputs.member)[discipline.value.ability];
    return Math.floor((score - 10) / 2);
  });
  const profBonus = computed(() => toValue(inputs.member).proficiency_bonus);
  const effectiveProfBonus = computed(() => (toValue(inputs.hasProficiency) ? profBonus.value : 0));

  function toggleModifier(idx: number) {
    if (selectedModifiers.value.has(idx)) selectedModifiers.value.delete(idx);
    else selectedModifiers.value.add(idx);
    selectedModifiers.value = new Set(selectedModifiers.value);
  }

  const plan = computed(() => planConsumption(toValue(inputs.slots), preferred.value));

  // The roll reads the rows the plan would spend. A critical failure spends only the primary, but
  // the roll comes first, so the whole plan counts.
  const spent = computed(() => spentRows(toValue(inputs.slots), plan.value.consumption));
  // Held from the moment of the attempt until reset: the spent rows leave (or change quality in)
  // the inventory, and the roll shown beside the result must still be the roll that was made.
  const rolledQuality = ref<{ modifier: number; line: string | null } | null>(null);
  const qualityModifier = computed(() => rolledQuality.value?.modifier ?? spentQualityModifier(spent.value));
  /** "Poor leather, fine ingots", or null when every spent row is standard. */
  const qualityLine = computed(() => (rolledQuality.value ? rolledQuality.value.line : qualityNote(spent.value)));

  const modifierBonuses = computed(() => {
    const mods = toValue(inputs.modifiers);
    // A ticked index can outlive its modifier when the DM edits the recipe mid-session.
    const bonuses = [...selectedModifiers.value].flatMap((idx) => (mods[idx] ? [mods[idx].bonus] : []));
    if (workspaceEnabled.value) bonuses.push(toValue(inputs.workspaceBonus));
    if (qualityModifier.value !== 0) bonuses.push(qualityModifier.value);
    return bonuses;
  });

  /** The recipe's own gates: it may demand tool proficiency, or the tools in the pack. */
  const locked = computed(() => {
    const recipe = toValue(inputs.recipe);
    return (
      (recipe.requires_proficiency && !toValue(inputs.hasProficiency)) ||
      (recipe.requires_tools && !toValue(inputs.hasTools))
    );
  });

  const canAttempt = computed(
    () => !locked.value && toValue(inputs.slots).every((s) => s.met) && !plan.value.short && !attempting.value,
  );

  function nameOf(ref: string): string | undefined {
    return resolveItemName(ref, toValue(inputs.allItems), toValue(inputs.itemNameMap));
  }

  const outputNames = computed(() => outputDisplayNames(toValue(inputs.outputs), nameOf));

  async function attempt() {
    // A second tap while the first is rolling must not spend the ingredients twice.
    if (attempting.value) return;
    if (!canAttempt.value) return;
    attempting.value = true;
    attemptError.value = null;
    chatNotice.value = null;
    rolledQuality.value = { modifier: qualityModifier.value, line: qualityLine.value };

    const { consumption, primaryConsumption, primary } = plan.value;
    const recipe = toValue(inputs.recipe);
    const outputs = toValue(inputs.outputs);
    const member = toValue(inputs.member);
    const allItems = toValue(inputs.allItems);

    try {
      // A ref whose name cannot be resolved is left OUT of the map rather than
      // mapped to "". This is payload, not display: an empty string travels to
      // `attemptCraft` and renders as a nameless item, where an absent key lets
      // the consumer apply its own fallback.
      const resolvedOutputNames: Record<string, string> = {};
      for (const o of outputs) {
        const ref = inventoryItemRef(o);
        const name = ref ? nameOf(ref) : undefined;
        if (ref && name) resolvedOutputNames[ref] = name;
      }

      const res = await attemptCraft({
        recipe,
        outputs: [...outputs],
        outputItemNames: resolvedOutputNames,
        ingredientConsumption: consumption,
        primaryConsumption,
        // Null when the recipe consumes nothing: there is no item to ruin.
        primaryInventoryItem: primary
          ? {
              id: primary.id,
              // Both columns as they really are, so the ruined row keeps a
              // library reference instead of losing it.
              item_id: primary.item_id,
              library_item_id: primary.library_item_id,
              name: rowDisplayName(primary, allItems),
              carried_by: primary.carried_by,
              campaign_id: primary.campaign_id,
            }
          : null,
        modifierBonuses: modifierBonuses.value,
        abilityMod: abilityMod.value,
        profBonus: effectiveProfBonus.value,
        hasTools: toValue(inputs.hasTools),
        partyMemberId: member.id,
      });

      result.value = res;

      const msg = craftChatMessage({
        memberName: member.name,
        recipeName: recipe.name,
        dc: recipe.dc,
        result: res,
        abilityMod: abilityMod.value,
        abilityLabel: discipline.value.ability.toUpperCase(),
        hasProficiency: toValue(inputs.hasProficiency),
        profBonus: profBonus.value,
        modifierBonuses: modifierBonuses.value,
        outputNames: outputNames.value,
        fine: isFineResult(res.outcome, res.diff),
      });
      // The attempt already happened, so a failed post must not read as a failed craft:
      // it surfaces inline (no toast here, on purpose) and the result stays on screen.
      await sendMessage(msg).catch((e) => {
        reportHandledError(e, "craft-attempt-chat-post");
        chatNotice.value = "Your craft went through, but the result could not be posted to the chat.";
      });
    } catch (err) {
      attemptError.value = err instanceof Error ? err.message : "An unexpected error occurred.";
    } finally {
      attempting.value = false;
    }
  }

  /**
   * Back to the bench after a failure or a critical failure: clears the result and any
   * notices so the player can roll again. The situation checkboxes and the preferred
   * rows are kept, since the player is repeating the same craft.
   */
  function reset() {
    result.value = null;
    rolledQuality.value = null;
    attemptError.value = null;
    chatNotice.value = null;
  }

  return {
    selectedModifiers,
    workspaceEnabled,
    preferred,
    attempting,
    result,
    attemptError,
    chatNotice,
    discipline,
    abilityMod,
    profBonus,
    modifierBonuses,
    qualityModifier,
    qualityLine,
    outputNames,
    plan,
    locked,
    canAttempt,
    toggleModifier,
    attempt,
    reset,
  };
}
