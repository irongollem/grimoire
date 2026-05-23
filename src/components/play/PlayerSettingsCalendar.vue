<template>
  <SettingsSection
    v-if="icalFeedUrl"
    title="Calendar Subscription"
    description="Subscribe once and your calendar app will automatically receive future session updates."
  >
    <!-- URL field + copy -->
    <div class="flex items-center gap-2">
      <input
        :value="icalFeedUrl"
        readonly
        class="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-mono text-xs text-muted-foreground select-all focus:outline-none focus:ring-1 focus:ring-ring truncate"
        @click="($event.target as HTMLInputElement).select()"
      />
      <button
        class="shrink-0 inline-flex items-center gap-1 font-cinzel text-2xs md:text-sm tracking-wider px-2.5 py-1.5 rounded border border-border hover:bg-muted transition-colors"
        :title="calCopied ? 'Copied!' : 'Copy URL'"
        @click="copyFeedUrl"
      >
        <IconCheck v-if="calCopied" class="h-3 w-3 text-elven-green" />
        <IconCopy v-else class="h-3 w-3" />
        {{ calCopied ? 'Copied' : 'Copy' }}
      </button>
    </div>

    <!-- Subscribe button -->
    <div class="mt-3">
      <a
        :href="webcalUrl"
        class="inline-flex items-center gap-1.5 font-cinzel text-2xs md:text-sm tracking-wider px-3 py-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        <IconAddEvent class="h-3 w-3" />
        Subscribe in Calendar App
      </a>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import { IconAddEvent, IconCheck, IconCopy } from "@/lib/icons";
import { useCampaignById } from "@/composables/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";

const campaign = useCampaignStore();
const { data: campaignData } = useCampaignById(() => campaign.activeCampaignId);

const icalFeedUrl = computed(() => {
  const token = campaignData.value?.ical_token;
  if (!token) return null;
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/ical-feed/${token}`;
});

const webcalUrl = computed(() =>
  icalFeedUrl.value?.replace(/^https?:\/\//, "webcal://") ?? undefined
);

const calCopied = ref(false);

async function copyFeedUrl() {
  if (!icalFeedUrl.value) return;
  await navigator.clipboard.writeText(icalFeedUrl.value);
  calCopied.value = true;
  setTimeout(() => { calCopied.value = false; }, 2000);
}
</script>
