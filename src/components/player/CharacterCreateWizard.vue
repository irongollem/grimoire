<template>
  <div class="max-w-2xl mx-auto pb-8 space-y-6">

    <!-- Step indicator -->
    <div>
      <h1 class="text-heading-lg font-bold text-foreground">
        {{ isEditMode ? 'Edit Character' : 'Create Your Character' }}
      </h1>
      <div ref="stepBar" class="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
        <template v-for="(step, idx) in activeSteps" :key="step.id">
          <AppButton
            variant="ghost"
            size="xs"
            class="shrink-0"
            :active="wizardStep === idx"
            :data-current-step="wizardStep === idx ? 'true' : undefined"
            :disabled="idx > wizardStep"
            :class="idx < wizardStep ? 'text-primary/70 hover:text-primary' : ''"
            @click="idx < wizardStep && (wizardStep = idx)"
          >
            <span class="w-4 h-4 rounded-full text-2xs flex items-center justify-center shrink-0"
              :class="wizardStep === idx ? 'bg-white/20' : idx < wizardStep ? 'bg-primary/20' : 'bg-muted'">
              {{ idx + 1 }}
            </span>
            {{ step.label }}
          </AppButton>
          <div v-if="idx < activeSteps.length - 1" class="shrink-0 w-3 h-px bg-border" />
        </template>
      </div>
    </div>

    <!-- Step: Edition (new characters only; every later step is filtered by it) -->
    <CharacterCreateEditionStep v-if="currentStepId === 'edition'" :form="form" />

    <!-- Step: Basics -->
    <CharacterCreateBasicsStep v-else-if="currentStepId === 'basics'" :form="form" />

    <!-- Step: Abilities -->
    <CharacterCreateAbilitiesStep v-else-if="currentStepId === 'abilities'" :form="form" />

    <!-- Step: Background & Identity -->
    <CharacterCreateBackgroundStep v-else-if="currentStepId === 'background'" :form="form" />

    <!-- Step: Class + Proficiencies -->
    <CharacterCreateClassStep v-else-if="currentStepId === 'class'" :form="form" />

    <!-- Step: Equipment -->
    <CharacterCreateEquipmentStep v-else-if="currentStepId === 'equipment'" :form="form" />

    <!-- Step: Done -->
    <CharacterCreateDoneStep v-else-if="currentStepId === 'done'" :form="form" />

    <!-- Footer nav (not shown on Done step — actions are inline there) -->
    <p v-if="blockedByAsiChoice" class="text-caption text-ink-caution  italic text-right">
      Finish the ability score choice above, or clear it, before continuing.
    </p>
    <p v-else-if="blockedByOriginFeat" class="text-caption text-ink-caution italic text-right">
      {{ originFeatMessage }} Pick another background to continue.
    </p>
    <p v-else-if="blockedBySubclass" class="text-caption text-ink-caution italic text-right">
      Choose your subclass above before continuing.
    </p>
    <div class="flex items-center justify-between pt-2 border-t border-border">
      <!-- Back / Cancel -->
      <AppButton v-if="wizardStep > 0" variant="subtle" size="md" label="← Back" @click="wizardStep--" />
      <AppButton v-else variant="subtle" size="md" label="Cancel" @click="router.push(backRoute)" />

      <!-- Next / Skip (hidden on Done step) -->
      <div v-if="wizardStep < activeSteps.length - 1" class="flex items-center gap-2">
        <AppButton v-if="currentStepId !== 'edition'" variant="ghost" size="md" label="Skip" :disabled="blockedByAsiChoice || blockedBySubclass || blockedByOriginFeat" @click="wizardStep++" />
        <AppButton
          variant="primary"
          size="md"
          label="Next →"
          :disabled="nextBlocked"
          @click="wizardStep++"
        />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { inject, computed, ref, watch, onMounted, nextTick } from "vue";
import { CHARACTER_FORM_KEY } from "@/composables/party/useCharacterCreationForm";
import { editionStepBlocked } from "@/composables/party/characterCreationEdition";
import { WIZARD_STEPS, WIZARD_STEPS_EDIT } from "@/rules/characterCreation";
import { useConfirm } from "@/composables/useConfirm";
import { useUnsavedGuard } from "@/composables/useUnsavedGuard";
import { prefersReducedMotion } from "@/lib/motion";
import AppButton from "@/components/common/controls/AppButton.vue";
import CharacterCreateEditionStep from "@/components/player/CharacterCreateEditionStep.vue";
import CharacterCreateBasicsStep from "@/components/player/CharacterCreateBasicsStep.vue";
import CharacterCreateAbilitiesStep from "@/components/player/CharacterCreateAbilitiesStep.vue";
import CharacterCreateBackgroundStep from "@/components/player/CharacterCreateBackgroundStep.vue";
import CharacterCreateClassStep from "@/components/player/CharacterCreateClassStep.vue";
import CharacterCreateEquipmentStep from "@/components/player/CharacterCreateEquipmentStep.vue";
import CharacterCreateDoneStep from "@/components/player/CharacterCreateDoneStep.vue";

const form = inject(CHARACTER_FORM_KEY)!;
const {
  router, f, wizardStep, isEditMode, isDmCreate, backRoute, backgroundAsiIncomplete, chosenRuleset, landingCampaign,
  blockedBySubclassChoice, finished, originFeatMessage,
} = form;
const confirm = useConfirm();

// Everything made so far lives only in this form: one tap on the bottom nav, a
// back gesture or Cancel would throw it away. Past the first step, or once a name
// is typed, leaving asks first; a character that has been saved does not.
useUnsavedGuard({
  isDirty: () => !isEditMode.value && !finished.value && (wizardStep.value > 0 || !!f.name.trim()),
  ask: () => confirm.confirm("Your character isn't saved yet. Leave and lose what you've entered?", {
    title: "Leave character creation?",
    confirmLabel: "Leave",
  }),
});

const activeSteps = computed(() => isEditMode.value ? WIZARD_STEPS_EDIT : WIZARD_STEPS);
const currentStepId = computed(() => activeSteps.value[wizardStep.value]?.id ?? "done");

// A half-made 2024 background ASI choice blocks leaving the background step —
// it must be finished or explicitly cleared (empty is a valid skip).
const blockedByAsiChoice = computed(() => currentStepId.value === "background" && backgroundAsiIncomplete.value);
// A background whose origin feat is not in this table's books cannot be taken.
const blockedByOriginFeat = computed(() => currentStepId.value === "background" && originFeatMessage.value !== null);
// A class that picks its subclass at level 1 must be answered before leaving the
// class step, the same way the level-up wizard will not move on without it.
const blockedBySubclass = computed(() => currentStepId.value === "class" && blockedBySubclassChoice.value);

// Each step says what it needs before Next: an edition the table can take, a name.
const nextBlocked = computed(() => {
  if (blockedByAsiChoice.value || blockedBySubclass.value || blockedByOriginFeat.value) return true;
  if (currentStepId.value === "edition") {
    return editionStepBlocked({ chosen: chosenRuleset.value, landing: landingCampaign.value, isDmCreate: isDmCreate.value });
  }
  return currentStepId.value === "basics" && !f.name.trim();
});

// The bar scrolls sideways on a phone, so the step the player is on has to be
// brought into view whenever it changes, or from step 5 on it sits off-screen.
const stepBar = ref<HTMLElement | null>(null);
async function revealCurrentStep() {
  await nextTick();
  const el = stepBar.value?.querySelector<HTMLElement>("[data-current-step='true']");
  el?.scrollIntoView?.({
    inline: "center",
    block: "nearest",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}
watch(wizardStep, revealCurrentStep);
onMounted(revealCurrentStep);
</script>
