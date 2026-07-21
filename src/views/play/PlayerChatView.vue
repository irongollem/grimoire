<template>
  <div class="flex flex-col h-full min-h-0">
    <h2 class="text-heading-lg font-bold text-foreground mb-4 shrink-0">Chat &amp; Rolls</h2>
    <div class="flex-1 min-h-0 rounded-lg border border-border bg-card overflow-hidden">
      <CampaignChatPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import CampaignChatPanel from "@/components/chat/CampaignChatPanel.vue";
</script>
