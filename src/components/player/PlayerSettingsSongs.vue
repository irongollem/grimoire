<template>
  <!-- Only once the DM has shared something: an empty Songs page is nothing to send a player to. -->
  <SettingsSection
    v-if="hasSongs"
    title="Songs"
    description="The music your DM shared with the table, as big picture buttons anyone can tap, even a player who cannot read yet. Open it on a phone and add it to the home screen: it pins as its own app."
  >
    <AppButton variant="primary" size="md" :icon="IconMusic" label="Open Songs" :to="{ name: 'songs' }" />
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconMusic } from "@/lib/icons";
import { usePlayerSongs } from "@/composables/soundboard/usePlayerSongs";
import AppButton from "@/components/common/controls/AppButton.vue";
import SettingsSection from "@/components/common/settings/SettingsSection.vue";

const { data } = usePlayerSongs();
const hasSongs = computed(() => (data.value?.length ?? 0) > 0);
</script>
