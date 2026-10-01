<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h2 class="text-heading-sm font-bold text-foreground">Which edition?</h2>
      <p class="text-body text-muted-foreground italic">
        The edition decides which species, backgrounds, classes and spells this character is built from.
      </p>
    </div>
    <RulesetPicker
      :model-value="chosenRuleset"
      label="Character edition"
      :notes="notes"
      @update:model-value="chooseRuleset"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RulesetPicker from "@/components/rules/RulesetPicker.vue";
import { editionStepNotes } from "@/composables/party/characterCreationEdition";
import type { CharacterCreationForm } from "@/composables/party/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();
const { chosenRuleset, chooseRuleset, landingCampaign, isDmCreate } = form;

const notes = computed(() => editionStepNotes({ landing: landingCampaign.value, isDmCreate: isDmCreate.value }));
</script>
