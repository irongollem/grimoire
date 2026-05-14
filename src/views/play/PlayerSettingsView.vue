<template>
  <PageHeader title="Settings" description="Your profile for this campaign">
    <div class="max-w-lg space-y-8">
      <PlayerSettingsDisplayName />
      <PlayerSettingsInstall />
      <PlayerSettingsCharacterClaim />
      <PlayerSettingsSessions />
      <PlayerSettingsCalendar />
      <PlayerSettingsNavigation />
      <PlayerSettingsNotifications />
      <PlayerSettingsAppearance />
      <PlayerSettingsAccount />

      <!-- Legal -->
      <div class="flex items-center gap-5 pt-2 pb-6">
        <RouterLink
          to="/privacy"
          class="font-cinzel text-2xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
        >
          Privacy Policy
        </RouterLink>
        <span class="text-border text-xs">·</span>
        <RouterLink
          to="/terms"
          class="font-cinzel text-2xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
        >
          Terms of Service
        </RouterLink>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import PlayerSettingsDisplayName from "@/components/play/PlayerSettingsDisplayName.vue";
import PlayerSettingsInstall from "@/components/play/PlayerSettingsInstall.vue";
import PlayerSettingsCharacterClaim from "@/components/play/PlayerSettingsCharacterClaim.vue";
import PlayerSettingsSessions from "@/components/play/PlayerSettingsSessions.vue";
import PlayerSettingsCalendar from "@/components/play/PlayerSettingsCalendar.vue";
import PlayerSettingsNavigation from "@/components/play/PlayerSettingsNavigation.vue";
import PlayerSettingsNotifications from "@/components/play/PlayerSettingsNotifications.vue";
import PlayerSettingsAppearance from "@/components/play/PlayerSettingsAppearance.vue";
import PlayerSettingsAccount from "@/components/play/PlayerSettingsAccount.vue";
</script>
