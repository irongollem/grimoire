<template>
  <div class="max-w-2xl mx-auto pb-8 space-y-6">

    <!-- Step indicator -->
    <div>
      <h1 class="text-heading-lg font-bold text-foreground">
        {{ isEditMode ? 'Edit Character' : 'Create Your Character' }}
      </h1>
      <div class="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
        <template v-for="(step, idx) in activeSteps" :key="step.id">
          <AppButton
            variant="ghost"
            size="xs"
            class="shrink-0"
            :active="wizardStep === idx"
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

    <!-- Step: Basics -->
    <CharacterCreateBasicsStep v-if="currentStepId === 'basics'" :form="form" />

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
    <p v-if="blockedByAsiChoice" class="text-caption text-amber-600 dark:text-amber-400 italic text-right">
      Finish the ability score choice above, or clear it, before continuing.
    </p>
    <div class="flex items-center justify-between pt-2 border-t border-border">
      <!-- Back / Cancel -->
      <AppButton v-if="wizardStep > 0" variant="subtle" size="md" label="← Back" @click="wizardStep--" />
      <AppButton v-else variant="subtle" size="md" label="Cancel" @click="router.push(backRoute)" />

      <!-- Next / Skip (hidden on Done step) -->
      <div v-if="wizardStep < activeSteps.length - 1" class="flex items-center gap-2">
        <AppButton variant="ghost" size="md" label="Skip" :disabled="blockedByAsiChoice" @click="wizardStep++" />
        <AppButton
          variant="primary"
          size="md"
          label="Next →"
          :disabled="(wizardStep === 0 && !f.name.trim()) || blockedByAsiChoice"
          @click="wizardStep++"
        />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { inject, computed } from "vue";
import { CHARACTER_FORM_KEY } from "@/composables/party/useCharacterCreationForm";
import { WIZARD_STEPS, WIZARD_STEPS_EDIT } from "@/rules/characterCreation";
import AppButton from "@/components/common/AppButton.vue";
import CharacterCreateBasicsStep from "@/components/play/CharacterCreateBasicsStep.vue";
import CharacterCreateAbilitiesStep from "@/components/play/CharacterCreateAbilitiesStep.vue";
import CharacterCreateBackgroundStep from "@/components/play/CharacterCreateBackgroundStep.vue";
import CharacterCreateClassStep from "@/components/play/CharacterCreateClassStep.vue";
import CharacterCreateEquipmentStep from "@/components/play/CharacterCreateEquipmentStep.vue";
import CharacterCreateDoneStep from "@/components/play/CharacterCreateDoneStep.vue";

const form = inject(CHARACTER_FORM_KEY)!;
const { router, f, wizardStep, isEditMode, backRoute, backgroundAsiIncomplete } = form;

const activeSteps = computed(() => isEditMode.value ? WIZARD_STEPS_EDIT : WIZARD_STEPS);
const currentStepId = computed(() => activeSteps.value[wizardStep.value]?.id ?? "done");

// A half-made 2024 background ASI choice blocks leaving the background step —
// it must be finished or explicitly cleared (empty is a valid skip).
const blockedByAsiChoice = computed(() => currentStepId.value === "background" && backgroundAsiIncomplete.value);
</script>
