<template>
  <SettingsSection title="Pictures" description="How pictures show on your screen.">
    <SettingsToggleRow
      label="Show AI labels"
      description="Turning them off hides them on your screen only. Everyone else still sees them."
      :model-value="showAiLabels"
      @update:model-value="setShowAiLabels($event)"
    />
    <SettingsToggleRow
      label="Low art"
      description="No pictures or placeholders in lists and sheets; they are set for text instead. Maps, Book Nooks, handouts and the gallery are not affected."
      :model-value="lowArt"
      @update:model-value="setLowArt($event)"
    />
  </SettingsSection>
</template>

<script setup lang="ts">
/*
  Each viewer's picture switches: the AI labels (`AiGeneratedBadge`) and low art
  (#1179, no record pictures or placeholders). Shown on the account page, which
  both lenses reach, and on the player settings page, where a player looks for
  display options first.
*/
import SettingsSection from "@/components/common/settings/SettingsSection.vue";
import SettingsToggleRow from "@/components/common/settings/SettingsToggleRow.vue";
import { useAiLabelPrefs } from "@/composables/ai/useAiLabelPrefs";
import { useLowArt } from "@/composables/useLowArt";

const { showAiLabels, setShowAiLabels } = useAiLabelPrefs();
const { lowArt, setLowArt } = useLowArt();
</script>
