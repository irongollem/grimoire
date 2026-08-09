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

      <AccountSummarySection link-to="/account" link-label="Manage account &amp; billing →" />

      <!-- Legal -->
      <div class="flex items-center gap-5 pt-2 pb-6">
        <a
          :href="legalUrl('privacy')"
          target="_blank"
          rel="noopener noreferrer"
          class="font-cinzel text-2xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
        >
          Privacy Policy
        </a>
        <span class="text-border text-xs">·</span>
        <a
          :href="legalUrl('terms')"
          target="_blank"
          rel="noopener noreferrer"
          class="font-cinzel text-2xs text-muted-foreground hover:text-foreground tracking-wide transition-colors"
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
import PlayerSettingsDisplayName from "@/components/play/PlayerSettingsDisplayName.vue";
import PlayerSettingsInstall from "@/components/play/PlayerSettingsInstall.vue";
import PlayerSettingsCharacterClaim from "@/components/play/PlayerSettingsCharacterClaim.vue";
import PlayerSettingsSessions from "@/components/play/PlayerSettingsSessions.vue";
import PlayerSettingsCalendar from "@/components/play/PlayerSettingsCalendar.vue";
import PlayerSettingsNavigation from "@/components/play/PlayerSettingsNavigation.vue";
import PlayerSettingsNotifications from "@/components/play/PlayerSettingsNotifications.vue";
import PlayerSettingsAppearance from "@/components/play/PlayerSettingsAppearance.vue";
</script>
