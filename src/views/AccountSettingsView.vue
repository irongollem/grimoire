<template>
  <PageHeader title="My Account" description="Your account across every campaign">
    <div class="max-w-lg space-y-8">
      <AccountSettings />

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
import PageHeader from "@/components/common/list/PageHeader.vue";
import AccountSettings from "@/components/account/AccountSettings.vue";
</script>
