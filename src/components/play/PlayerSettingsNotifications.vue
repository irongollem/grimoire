<template>
  <!-- Email notifications -->
  <SettingsSection title="Email Notifications" description="Emails when your DM publishes something for you.">
    <div class="space-y-4">
      <SettingsToggleRow
        label="Shared session notes"
        description="Get an email when your DM shares a note with you."
        :model-value="prefs.email_shared_notes"
        @update:model-value="setPref('email_shared_notes', $event)"
      />
      <SettingsToggleRow
        label="Session date proposals"
        description="Get an email when your DM proposes a new session date."
        :model-value="prefs.email_session_proposals"
        @update:model-value="setPref('email_session_proposals', $event)"
      />
    </div>
  </SettingsSection>

  <!-- Combat notifications -->
  <SettingsSection title="Combat Notifications" description="Alerts when it's your turn in a live encounter.">
    <div class="space-y-4">
      <SettingsToggleRow
        label="Turn audio cue"
        description="A short chime plays when your turn begins."
        :model-value="turnAudioEnabled"
        @update:model-value="setTurnAudio($event)"
      />
      <SettingsToggleRow
        label="Dice roll sounds"
        description="A clack plays on every roll. Crits and fumbles have distinct sounds."
        :model-value="diceAudioEnabled"
        @update:model-value="setDiceAudio($event)"
      />
    </div>
  </SettingsSection>

  <!-- Dice settings -->
  <SettingsSection title="Dice" description="Choose where rolls come from.">
    <div class="flex items-center justify-between">
      <div>
        <p class="font-cinzel text-xs text-foreground tracking-wide">Dice source</p>
        <p class="text-caption text-muted-foreground italic">Physical mode prompts you to enter the result of dice you rolled yourself.</p>
      </div>
      <div class="flex rounded-md border border-border overflow-hidden text-label md:text-sm shrink-0 ml-3">
        <button
          type="button"
          class="px-3 py-1 transition-colors"
          :class="diceMode === 'tool' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'"
          @click="setDiceMode('tool')"
        >TOOL</button>
        <button
          type="button"
          class="px-3 py-1 transition-colors border-l border-border"
          :class="diceMode === 'physical' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'"
          @click="setDiceMode('physical')"
        >PHYSICAL</button>
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import SettingsToggleRow from "@/components/common/SettingsToggleRow.vue";
import { usePlayerCombatPrefs } from "@/composables/usePlayerCombatPrefs";
import { useDicePrefs } from "@/composables/useDicePrefs";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  NOTIFICATION_PREFERENCE_DEFAULTS,
  type NotificationPreferences,
} from "@/composables/useNotificationPreferences";

const { turnAudioEnabled, setTurnAudio } = usePlayerCombatPrefs();
const { diceAudioEnabled, setDiceAudio, diceMode, setDiceMode } = useDicePrefs();

const { data: emailPrefs } = useNotificationPreferences();
const { mutate: updatePrefs } = useUpdateNotificationPreferences();

const prefs = computed(() => emailPrefs.value ?? NOTIFICATION_PREFERENCE_DEFAULTS);

function setPref(key: keyof NotificationPreferences, value: boolean) {
  updatePrefs({ [key]: value });
}
</script>
