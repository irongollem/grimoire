<template>
  <MindedCharacterGate v-if="minded" :name="minded.member.name" :owner-name="minded.ownerName" />
  <CharacterEditTabs v-else-if="isEditMode" />
  <CharacterCreateWizard v-else />
</template>

<script setup lang="ts">
import { computed, provide } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useCharacterCreationForm, CHARACTER_FORM_KEY } from "@/composables/party/useCharacterCreationForm";
import { usePlayableCharacters } from "@/composables/party/usePlayableCharacters";
import CharacterEditTabs from "@/components/player/CharacterEditTabs.vue";
import CharacterCreateWizard from "@/components/player/CharacterCreateWizard.vue";
import MindedCharacterGate from "@/components/player/caretaking/MindedCharacterGate.vue";

const form = useCharacterCreationForm();
provide(CHARACTER_FORM_KEY, form);

const { isEditMode } = form;

// Looking after a character is not owning it (#1059): the edit screen is the owner's.
const route = useRoute();
const auth = useAuthStore();
const { characters } = usePlayableCharacters();
const minded = computed(() => {
  if (!isEditMode.value) return null;
  const id = (route.query.memberId as string | undefined) ?? auth.linkedPartyMemberId;
  return characters.value.find((c) => c.kind === "minding" && c.member.id === id) ?? null;
});
</script>
