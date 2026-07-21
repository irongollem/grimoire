<template>
  <div class="relative">
    <button
      class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md font-fell text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      @click="open = !open"
    >
      <IconAnnounce class="h-3.5 w-3.5 shrink-0" />
      Announce to players
    </button>

    <!-- Popover -->
    <div
      v-if="open"
      class="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border bg-card shadow-lg p-3 space-y-2 z-50"
    >
      <p class="font-cinzel text-2xs font-semibold text-muted-foreground tracking-wider">
        IconSend Announcement
      </p>
      <textarea
        v-model="text"
        placeholder="e.g. Quest completed! You've earned 500 XP."
        rows="2"
        class="w-full resize-none bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        @keydown.enter.exact.prevent="send"
        @keydown.escape="open = false"
      />
      <div class="flex justify-end gap-2">
        <button
          class="font-fell text-xs text-muted-foreground hover:text-foreground transition-colors"
          @click="open = false"
        >Cancel</button>
        <button
          :disabled="!text.trim() || sending"
          class="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 font-cinzel text-2xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="send"
        >
          <IconSend class="h-3 w-3" />
          {{ sending ? "Sending…" : "Send" }}
        </button>
      </div>
      <p v-if="sent" class="font-fell text-xs text-elven-green text-right">Sent!</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconAnnounce, IconSend } from '@/lib/icons';
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";

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
