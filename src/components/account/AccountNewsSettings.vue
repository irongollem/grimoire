<template>
  <!-- Opt-in news emails. A young player's account has no email of its own
       (#919), so there is nothing to consent to. -->
  <SettingsSection v-if="!isChild" title="News and updates" description="Occasional emails about what is new in Dungeon Grimoire. Off unless you turn it on.">
    <SettingsToggleRow
      label="Email me news and updates"
      description="A few times a year. Turn it off and they stop."
      :model-value="prefs.email_product_news"
      @update:model-value="updatePrefs({ email_product_news: $event })"
    />
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SettingsSection from "@/components/common/settings/SettingsSection.vue";
import SettingsToggleRow from "@/components/common/settings/SettingsToggleRow.vue";
import { useChildAccount } from "@/composables/account/useChildAccount";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  NOTIFICATION_PREFERENCE_DEFAULTS,
} from "@/composables/account/useNotificationPreferences";

const { isChild } = useChildAccount();
const { data: emailPrefs } = useNotificationPreferences();
const { mutate: updatePrefs } = useUpdateNotificationPreferences();

const prefs = computed(() => emailPrefs.value ?? NOTIFICATION_PREFERENCE_DEFAULTS);
</script>
