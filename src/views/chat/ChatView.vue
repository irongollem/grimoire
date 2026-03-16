<template>
  <div class="flex flex-col h-full min-h-0">
    <PageHeader title="Campaign Chat" description="Rolls and messages from all players" />
    <div class="flex-1 min-h-0 rounded-lg border border-border bg-card overflow-hidden mt-4">
      <CampaignChatPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import PageHeader from "@/components/common/PageHeader.vue";
import CampaignChatPanel from "@/components/chat/CampaignChatPanel.vue";
</script>
