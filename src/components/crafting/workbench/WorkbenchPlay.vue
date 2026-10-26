<template>
  <div class="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:p-6" :class="{ shake: isShaking }">
    <header class="flex items-center gap-3">
      <AppButton :to="{ name: 'play-crafting' }" variant="ghost" size="icon-sm" :icon="IconChevronLeft" aria-label="Back to the Workshop" />
      <div class="min-w-0">
        <h1 class="truncate text-heading-sm font-bold text-foreground">{{ recipe.name }}</h1>
        <p class="text-caption text-muted-foreground">{{ discipline.label }} · {{ art.bench.label }}</p>
      </div>
    </header>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <WorkbenchScene
        v-if="wide"
        :art="art"
        :slots="shownSlots"
        :preferred="attempt.preferred.value"
        :all-items="allItems"
        :outcome="outcome"
        :rolling="attempt.attempting.value"
        :recipe-name="recipe.name"
        :recipe-art="recipeArt"
        :output-text="attempt.outputNames.value.join(', ')"
        :done-verb="discipline.doneVerb"
        @open="onOpen"
      />

      <div v-else class="flex flex-col gap-3">
        <div class="relative h-28 overflow-hidden rounded-lg border border-border bg-muted">
          <img :src="art.phoneSrc" alt="" aria-hidden="true" draggable="false" class="h-full w-full object-cover object-top" />
          <WorkbenchOutcomeFx v-if="outcome" :outcome="outcome" />
        </div>
        <ul class="flex flex-col gap-2" aria-label="Ingredients">
          <li v-for="s in shownSlots" :key="s.index">
            <WorkbenchSlot
              :slot="s"
              :total="shownSlots.length"
              variant="row"
              :state="slotState(s, outcome)"
              :art="art"
              :material="slotSprite(s, attempt.preferred.value[s.index], allItems)"
              :used="firstUsed(s, attempt.preferred.value[s.index])"
              :exit="exitForSlot(s, outcome)"
              @open="(el) => onOpen(s, el)"
            />
          </li>
        </ul>
        <p v-if="shownSlots.length === 0" class="text-caption text-muted-foreground italic">No ingredients required.</p>
      </div>

      <WorkbenchLedger
        v-model:workspace="attempt.workspaceEnabled.value"
        :recipe="recipe"
        :discipline="discipline"
        :modifiers="modifiers"
        :slots="shownSlots"
        :ability-mod="attempt.abilityMod.value"
        :prof-bonus="attempt.profBonus.value"
        :has-proficiency="proficient"
        :has-tools="tooled"
        :modifier-bonuses="attempt.modifierBonuses.value"
        :selected-modifiers="attempt.selectedModifiers.value"
        :can-attempt="attempt.canAttempt.value"
        :attempting="attempt.attempting.value"
        :result="attempt.result.value"
        :output-names="attempt.outputNames.value"
        :recipe-art="recipeArt"
        :short="attempt.plan.value.short"
        :quality-mod="attempt.qualityModifier.value"
        :quality-line="attempt.qualityLine.value"
        :fine="fine"
        :degrade-line="degradeLine"
        :attempt-error="attempt.attemptError.value"
        :chat-notice="attempt.chatNotice.value"
        @attempt="onAttempt"
        @retry="onRetry"
        @toggle-modifier="attempt.toggleModifier"
      />
    </div>

    <WorkbenchOutcomeModal
      v-if="outcome"
      :open="modalOpen"
      :outcome="outcome"
      :discipline="discipline"
      :recipe-name="recipe.name"
      :recipe-art="recipeArt"
      :output-text="attempt.outputNames.value.join(', ')"
      :lost="lost"
      :wreckage-name="wreckageName"
      :fine="fine"
      :degrade-line="degradeLine"
      :rolled-text="rolledText"
      :crafting-time="recipe.crafting_time"
      :crafting-time-unit="recipe.crafting_time_unit"
      :can-retry="attempt.canAttempt.value"
      @close="modalOpen = false"
      @retry="onRetry"
    />

    <WorkbenchSlotPicker
      v-if="openSlot"
      v-model:open="pickerOpen"
      :slot="openSlot"
      :total="slots.length"
      :anchor="anchorEl"
      :chosen-id="attempt.preferred.value[openSlot.index]"
      :member-id="member.id"
      :member-name="member.name"
      @choose="onChoose"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useCraftAttempt } from "@/composables/crafting/useCraftAttempt";
import type { PlayerCrafting } from "@/composables/crafting/usePlayerCrafting";
import { useAbove } from "@/composables/useBreakpoint";
import { useScreenShake } from "@/composables/useScreenShake";
import WorkbenchLedger from "@/components/crafting/workbench/WorkbenchLedger.vue";
import WorkbenchOutcomeFx from "@/components/crafting/workbench/WorkbenchOutcomeFx.vue";
import WorkbenchOutcomeModal from "@/components/crafting/workbench/WorkbenchOutcomeModal.vue";
import WorkbenchScene from "@/components/crafting/workbench/WorkbenchScene.vue";
import WorkbenchSlot from "@/components/crafting/workbench/WorkbenchSlot.vue";
import WorkbenchSlotPicker from "@/components/crafting/workbench/WorkbenchSlotPicker.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { craftBonus, rolledLine } from "@/lib/crafting/craftMessage";
import { degradeSentence, isFineResult } from "@/lib/crafting/qualityRules";
import { getDiscipline } from "@/lib/crafting/disciplines";
import { planConsumption, rowDisplayName, type IngredientSlot } from "@/lib/crafting/ingredients";
import { benchArtFor } from "@/lib/crafting/workbench/art";
import { exitForSlot, firstUsed, lostMaterials, slotSprite, slotState } from "@/lib/crafting/workbench/slotMaterial";
import { IconChevronLeft } from "@/lib/icons";
import { prefersReducedMotion } from "@/lib/motion";
import type { CraftingRecipe } from "@/types/crafting.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The bench itself: scene (desktop) or dish rows (phone) beside the ledger. Mounted only
 * once the recipe and the character exist, so the attempt composable gets real inputs.
 */
const { recipe, member, crafting } = defineProps<{
  recipe: CraftingRecipe;
  member: PartyMember;
  /** The view's own `usePlayerCrafting`, handed down so the bench does not build a second copy. */
  crafting: PlayerCrafting;
}>();

const { allItems, modifiersFor, outputsFor, artFor, hasProficiency, hasTools, slotsFor, recipeItemNames } = crafting;

const wide = useAbove("lg");
const discipline = computed(() => getDiscipline(recipe.discipline));
const slots = computed(() => slotsFor(recipe.id));
const modifiers = computed(() => modifiersFor(recipe.id));
const outputs = computed(() => outputsFor(recipe.id));
const art = computed(() => benchArtFor(recipe.discipline));
const recipeArt = computed(() => artFor(recipe));
const proficient = computed(() => hasProficiency(discipline.value.tools));
const tooled = computed(() => hasTools(discipline.value.tools));

const attempt = useCraftAttempt({
  recipe: () => recipe,
  outputs,
  slots,
  modifiers,
  member: () => member,
  hasTools: tooled,
  hasProficiency: proficient,
  workspaceBonus: () => discipline.value.workspaceBonus,
  allItems,
  itemNameMap: recipeItemNames,
});

const outcome = computed(() => attempt.result.value?.outcome ?? null);

// After the roll the bench shows the slots as they were when the attempt was made: the spent rows
// leave the inventory, so recomputing would name a different item than the one that was used
// (the steel ingot the player chose would read as the iron ingot left behind).
const frozenSlots = ref<IngredientSlot[] | null>(null);
const shownSlots = computed(() => (attempt.result.value && frozenSlots.value ? frozenSlots.value : slots.value));
function onAttempt() {
  frozenSlots.value = slots.value;
  void attempt.attempt();
}

// Try again after a failure or a critical failure: the bench shows the live inventory again.
function onRetry() {
  frozenSlots.value = null;
  attempt.reset();
}

// What the roll came to. The bench plays its reaction first, then the modal says it in words; a
// reader who has asked for less motion gets the modal at once, since there is no reaction to wait for.
const MODAL_DELAY_MS = { success: 1400, fail: 1400, ruin: 1700 } as const;
const modalOpen = ref(false);
let modalTimer: ReturnType<typeof setTimeout> | undefined;
const { isShaking, triggerShake } = useScreenShake();

watch(outcome, (o) => {
  clearTimeout(modalTimer);
  modalOpen.value = false;
  if (!o) return;
  const calm = prefersReducedMotion();
  if (o === "ruin" && !calm) triggerShake(450);
  if (calm) modalOpen.value = true;
  else modalTimer = setTimeout(() => (modalOpen.value = true), MODAL_DELAY_MS[o]);
});
onBeforeUnmount(() => clearTimeout(modalTimer));

const lost = computed(() => (outcome.value ? lostMaterials(shownSlots.value, attempt.preferred.value, outcome.value) : []));
// Both read the frozen slots: the live ones no longer hold what was spent.
const wreckageName = computed(() => {
  const primary = outcome.value ? planConsumption(shownSlots.value, attempt.preferred.value).primary : null;
  // Named as the ruined row is named, so the modal and the inventory agree.
  return primary ? rowDisplayName(primary, allItems.value) : null;
});
const fine = computed(() => {
  const res = attempt.result.value;
  return res ? isFineResult(res.outcome, res.diff) : false;
});
// A failure drops the primary ingredient one step; the frozen slots still hold the quality it had.
const degradeLine = computed(() => {
  if (outcome.value !== "fail") return null;
  const primary = planConsumption(shownSlots.value, attempt.preferred.value).primary;
  return primary ? degradeSentence(rowDisplayName(primary, allItems.value), primary.quality) : null;
});
const rolledText = computed(() => {
  const res = attempt.result.value;
  if (!res) return "";
  const bonus = craftBonus(attempt.abilityMod.value, attempt.profBonus.value, proficient.value, attempt.modifierBonuses.value);
  return rolledLine(res, bonus, recipe.dc);
});

// The picker: which dish is open, and the button it hangs off.
const openIndex = ref<number | null>(null);
const anchorEl = ref<HTMLElement | null>(null);
const openSlot = computed(() => (openIndex.value === null ? null : (slots.value.find((s) => s.index === openIndex.value) ?? null)));
const pickerOpen = computed({
  get: () => openIndex.value !== null,
  set: (v) => {
    if (!v) openIndex.value = null;
  },
});

function onOpen(slot: IngredientSlot, el: HTMLElement) {
  if (attempt.result.value) return; // spent: nothing left to choose
  anchorEl.value = el;
  openIndex.value = slot.index;
}

function onChoose(rowId: string) {
  if (openIndex.value === null) return;
  attempt.preferred.value = { ...attempt.preferred.value, [openIndex.value]: rowId };
}

watch(() => recipe.id, () => (openIndex.value = null));
</script>
