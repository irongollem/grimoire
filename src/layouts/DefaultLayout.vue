<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <AppSidebar />
    <AppMobileNav />

    <div class="flex-1 flex flex-col min-w-0">
      <AppTopBar />

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <CampaignChat />
  </div>
</template>

<script setup lang="ts">
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AppTopBar from "@/components/layout/AppTopBar.vue";
import AppMobileNav from "@/components/layout/AppMobileNav.vue";
import CampaignChat from "@/components/chat/CampaignChat.vue";
import { useCampaignPresence } from "@/composables/useCampaignPresence";

useCampaignPresence();
</script>
