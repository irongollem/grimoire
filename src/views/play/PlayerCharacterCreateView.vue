<template>
  <CharacterEditTabs v-if="isEditMode" />
  <CharacterCreateWizard v-else />
</template>

<script setup lang="ts">
import { provide } from "vue";
import { useCharacterCreationForm, CHARACTER_FORM_KEY } from "@/composables/useCharacterCreationForm";
import CharacterEditTabs from "@/components/play/CharacterEditTabs.vue";
import CharacterCreateWizard from "@/components/play/CharacterCreateWizard.vue";

const form = useCharacterCreationForm();
provide(CHARACTER_FORM_KEY, form);

const { isEditMode } = form;
</script>
