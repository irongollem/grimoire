<template>
  <div v-if="due.length > 0 || swapOffers.length > 0" class="space-y-4">
    <WizardStepCard v-if="due.length > 0" title="Choices">
      <div class="divide-y divide-border">
        <div v-for="entry in due" :key="dueKey(entry)" class="py-4 first:pt-0 last:pb-0">
          <ChoicePicker
            :due="entry"
            :context="contextFor(entry)"
            :feats-allowed="featsAllowed"
            :model-value="valueOf(entry)"
            @update:model-value="setValue(entry, $event)"
          />
        </div>
      </div>
      <p v-if="!allComplete" class="text-label text-muted-foreground">
        Finish every choice above before this level can be confirmed.
      </p>
    </WizardStepCard>

    <WizardStepCard v-if="swapOffers.length > 0" title="Optional class features">
      <p class="text-caption text-muted-foreground">
        Your table allows the optional features from Tasha's Cauldron of Everything. Each one takes the place of a feature you are gaining.
      </p>
      <ul class="space-y-2">
        <li v-for="offer in swapOffers" :key="offer.replacedKey">
          <AppCheckbox
            :model-value="Object.hasOwn(swapPicks, offer.replacedKey)"
            :label="`Take ${offer.replacementName} instead of ${offer.replacedFeatureName}`"
            @update:model-value="setSwap(offer, $event)"
          />
        </li>
      </ul>
    </WizardStepCard>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import WizardStepCard from "@/components/common/wizard/WizardStepCard.vue";
import type { DueChoice, OptionContext, SwapOffer } from "@/rules/features/levelUpChoices";
import type { ClassFeature } from "@/types/feature.types";
import ChoicePicker from "./ChoicePicker.vue";
import { dueKey, entryComplete, initialChoiceValue, type ChoiceValue } from "./choiceValue";

const { due, swapOffers, context, featsById, featsAllowed = true, spellVariantFor } = defineProps<{
  /** Everything this level owes, from `choicesDue`. */
  due: DueChoice[];
  /** Tasha's swaps on offer; empty when the table has not allowed them. */
  swapOffers: SwapOffer[];
  context: Omit<OptionContext, "existing">;
  featsById: ReadonlyMap<string, ClassFeature>;
  /** The `feats_2014` rule. */
  featsAllowed?: boolean;
  /** The variant that narrows an entry's spell lists, from the one source (`useLevelUpFeatures`). */
  spellVariantFor?: (entry: DueChoice) => string | null;
}>();

/** What the player has chosen, by `dueKey`. */
const values = defineModel<Record<string, ChoiceValue>>("values", { required: true });
/** Replaced conceptual key -> replacement feature id, for the swaps taken. */
const swapPicks = defineModel<Record<string, string>>("swaps", { required: true });
/** True once every entry holds what it owes; a swap is always optional. */
const complete = defineModel<boolean>("complete", { default: false });

function valueOf(entry: DueChoice): ChoiceValue {
  const key = dueKey(entry);
  return Object.hasOwn(values.value, key) ? values.value[key] : initialChoiceValue(entry);
}

function setValue(entry: DueChoice, next: ChoiceValue) {
  values.value = { ...values.value, [dueKey(entry)]: next };
}

// The Pact Boon and the invocations that need it are chosen at the same level, so the boon picked
// here counts before it is stored.
function contextFor(entry: DueChoice): Omit<OptionContext, "existing"> {
  const base =
    spellVariantFor === undefined || entry.choice.pick.kind !== "spell"
      ? context
      : { ...context, spellListVariant: spellVariantFor(entry) };
  const boonDue = due.find((d) => d.choice.key === "pact_boon");
  if (boonDue === undefined || entry.choice.key === "pact_boon") return base;
  const picked = valueOf(boonDue).picks[0];
  return picked === undefined ? base : { ...base, pactBoon: picked };
}

function setSwap(offer: SwapOffer, on: boolean) {
  const next = { ...swapPicks.value };
  if (on) next[offer.replacedKey] = offer.replacementId;
  else delete next[offer.replacedKey];
  swapPicks.value = next;
}

const allComplete = computed(() =>
  due.every((entry) => entryComplete(entry, valueOf(entry), contextFor(entry), featsById)),
);
watch(allComplete, (done) => (complete.value = done), { immediate: true });
</script>
