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
    <p v-if="landingCampaign" class="text-caption text-muted-foreground">
      This table's books decide what you can pick.
    </p>
    <p v-else class="text-caption text-muted-foreground">
      {{ booksLine }}
      <PlayerBooksPicker>
        <template #trigger="{ open, toggle }">
          <AppButton variant="link" size="inline-caption" :active="open" label="Choose books" @click="toggle" />
        </template>
      </PlayerBooksPicker>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import PlayerBooksPicker from "@/components/play/PlayerBooksPicker.vue";
import { useUserEnabledSources } from "@/composables/library/useEnabledSources";
import RulesetPicker from "@/components/rules/RulesetPicker.vue";
import { editionStepNotes } from "@/composables/party/characterCreationEdition";
import type { CharacterCreationForm } from "@/composables/party/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();
const { chosenRuleset, chooseRuleset, landingCampaign, isDmCreate } = form;

const { data: userBooks } = useUserEnabledSources();
// Unknown while the rows load: say the part that is true either way.
const booksLine = computed(() => {
  const n = userBooks.value?.length;
  if (n === undefined) return "Built from your books.";
  return n === 0 ? "Built from your books: the SRD." : `Built from your books: the SRD and ${n} more.`;
});

const notes = computed(() => editionStepNotes({ landing: landingCampaign.value, isDmCreate: isDmCreate.value }));
</script>
