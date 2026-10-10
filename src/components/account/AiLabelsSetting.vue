<template>
  <SettingsSection title="AI Labels" description="A small AI mark on pictures and text made with AI.">
    <SettingsToggleRow
      label="Show AI labels"
      description="Turning them off hides them on your screen only. Everyone else still sees them."
      :model-value="showAiLabels"
      @update:model-value="setShowAiLabels($event)"
    />
  </SettingsSection>
</template>

<script setup lang="ts">
/*
  Each viewer's switch for the AI labels (`AiGeneratedBadge`). Shown on the
  account page, which both lenses reach, and on the player settings page,
  where a player looks for display options first.
*/
import SettingsSection from "@/components/common/SettingsSection.vue";
import SettingsToggleRow from "@/components/common/SettingsToggleRow.vue";
import { useAiLabelPrefs } from "@/composables/ai/useAiLabelPrefs";

const { showAiLabels, setShowAiLabels } = useAiLabelPrefs();
</script>
