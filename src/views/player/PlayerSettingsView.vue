<template>
  <PageHeader flush title="Settings" description="Your profile for this campaign">
    <div class="max-w-lg space-y-8">
      <PlayerSettingsDisplayName />
      <PlayerSettingsInstall />
      <PlayerSettingsCharacterClaim />
      <PlayerSettingsSessions />
      <PlayerSettingsCalendar />
      <PlayerSettingsNavigation />
      <PlayerSettingsNotifications />
      <PlayerSettingsAppearance />
      <AiLabelsSetting />

      <AccountSummarySection link-to="/account" link-label="Manage account &amp; billing →" />

      <!-- Legal -->
      <div class="flex items-center gap-5 pt-2 pb-6">
        <a
          :href="legalUrl('privacy')"
          target="_blank"
          rel="noopener noreferrer"
          class="text-label text-muted-foreground hover:text-foreground transition-colors"
        >
          Privacy Policy
        </a>
        <span class="text-border text-xs">·</span>
        <a
          :href="legalUrl('terms')"
          target="_blank"
          rel="noopener noreferrer"
          class="text-label text-muted-foreground hover:text-foreground transition-colors"
        >
          Terms of Service
        </a>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { legalUrl } from "@/lib/marketing";
import PageHeader from "@/components/common/PageHeader.vue";
import AccountSummarySection from "@/components/account/AccountSummarySection.vue";
import AiLabelsSetting from "@/components/account/AiLabelsSetting.vue";
import PlayerSettingsDisplayName from "@/components/player/PlayerSettingsDisplayName.vue";
import PlayerSettingsInstall from "@/components/player/PlayerSettingsInstall.vue";
import PlayerSettingsCharacterClaim from "@/components/player/PlayerSettingsCharacterClaim.vue";
import PlayerSettingsSessions from "@/components/player/PlayerSettingsSessions.vue";
import PlayerSettingsCalendar from "@/components/player/PlayerSettingsCalendar.vue";
import PlayerSettingsNavigation from "@/components/player/PlayerSettingsNavigation.vue";
import PlayerSettingsNotifications from "@/components/player/PlayerSettingsNotifications.vue";
import PlayerSettingsAppearance from "@/components/player/PlayerSettingsAppearance.vue";
</script>
