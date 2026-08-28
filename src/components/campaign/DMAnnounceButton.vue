<template>
  <div class="relative">
    <AppButton
      variant="ghost"
      fill="muted"
      size="caption"
      block
      class="justify-start"
      :icon="IconAnnounce"
      label="Announce to players"
      @click="open = !open"
    />

    <!-- Popover -->
    <div
      v-if="open"
      class="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-card shadow-lg p-3 space-y-2 z-50"
    >
      <p class="flex items-center gap-1.5 text-label font-semibold text-muted-foreground">
        <IconSend class="h-3 w-3" />
        Announcement
      </p>
      <textarea
        v-model="text"
        placeholder="e.g. Quest completed! You've earned 500 XP."
        rows="2"
        class="w-full resize-none bg-background border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        @keydown.enter.exact.prevent="send"
        @keydown.escape="open = false"
      />
      <div class="flex justify-end gap-2">
        <AppButton variant="ghost" size="inline-caption" label="Cancel" @click="open = false" />
        <AppButton
          variant="primary"
          size="xs"
          icon-size="xs"
          :icon="IconSend"
          :disabled="!text.trim() || sending"
          :label="sending ? 'Sending…' : 'Send'"
          @click="send"
        />
      </div>
      <p v-if="sent" class="text-caption text-elven-green text-right">Sent!</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconAnnounce, IconSend } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";

const campaign = useCampaignStore();
const open    = ref(false);
const text    = ref("");
const sending = ref(false);
const sent    = ref(false);

async function send() {
  if (!text.value.trim() || !campaign.activeCampaignId) return;
  sending.value = true;
  try {
    await sendCampaignAnnouncement(campaign.activeCampaignId, text.value.trim());
    sent.value = true;
    text.value = "";
    setTimeout(() => { sent.value = false; open.value = false; }, 1500);
  } finally {
    sending.value = false;
  }
}
</script>
