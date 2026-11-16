<template>
  <!-- ── Calendar subscription ──────────────────────────────────────── -->
  <!-- Hidden for a child DM (#919): the feed is only useful paired with an
       email calendar app, and a young player's account never sends or
       receives email. -->
  <div
    v-if="icalFeedUrl && !isChild"
    class="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
  >
    <h3
      class="text-label-lg font-semibold text-muted-foreground uppercase"
    >
      Calendar Subscription
    </h3>
    <p class="text-caption text-muted-foreground">
      Subscribe once and your calendar app will automatically receive future
      session updates. Your regular evenings arrive as one repeating event,
      confirmed dates as normal events, and dates you have only suggested as
      tentative ones that leave the evening free.
    </p>

    <!-- URL field + copy -->
    <div class="flex items-center gap-2">
      <AppInput
        :model-value="icalFeedUrl"
        readonly
        :block="false"
        class="flex-1 truncate font-mono text-xs text-muted-foreground select-all"
        @click="($event.target as HTMLInputElement).select()"
      />
      <AppButton
        variant="outline"
        size="sm"
        class="shrink-0"
        :tooltip="copied ? 'Copied!' : 'Copy URL'"
        @click="copyUrl"
      >
        <template #icon>
          <IconCheck v-if="copied" class="h-3 w-3 text-elven-green" />
          <IconCopy v-else class="h-3 w-3" />
        </template>
        {{ copied ? "Copied" : "Copy" }}
      </AppButton>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center gap-2 flex-wrap">
      <AppButton
        variant="tinted"
        tone="primary"
        emphasis="soft"
        size="sm"
        :href="webcalUrl"
        :icon="IconAddEvent"
        label="Subscribe in Calendar App"
      />

      <AppButton
        variant="subtle"
        size="sm"
        :icon="IconDownload"
        tooltip="A one-off snapshot of the same events; it will not update"
        label="Download .ics"
        @click="exportIcal"
      />

      <AppButton
        v-if="campaign.isOwner"
        variant="subtle"
        size="sm"
        class="hover:text-destructive hover:border-destructive"
        :disabled="isRegenerating"
        :icon="IconRefresh"
        tooltip="Generate a new URL; existing subscriptions will stop updating"
        :label="isRegenerating ? 'Regenerating…' : 'Regenerate URL'"
        @click="regenerateToken"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconAddEvent, IconCheck, IconCopy, IconDownload, IconRefresh } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useCampaignById, useRegenerateIcalToken } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { useChildAccount } from "@/composables/account/useChildAccount";
import type { SessionCadence, SessionProposal } from "@/types/scheduling.types";
import { buildSessionFeed, type IcsSeries, type IcsSessionEvent } from "@edge-shared/ics.ts";
import { downloadBlob } from "@/lib/downloadBlob";

/** The campaign's calendar feed: its subscription URL, and the same events as a one-off download. */
const { cadence, proposals } = defineProps<{
  cadence: SessionCadence | null;
  proposals: readonly SessionProposal[];
}>();

const campaign = useCampaignStore();
const { isChild } = useChildAccount();
const today = useLocalToday();
const { data: campaignData } = useCampaignById(() => campaign.activeCampaignId);
const { mutateAsync: doRegenerateToken, isPending: isRegenerating } = useRegenerateIcalToken();

const icalFeedUrl = computed(() => {
  const token = campaignData.value?.ical_token;
  if (!token) return null;
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/ical-feed/${token}`;
});

const webcalUrl = computed(() => icalFeedUrl.value?.replace(/^https?:\/\//, "webcal://"));

const copied = ref(false);

async function copyUrl() {
  if (!icalFeedUrl.value) return;
  await navigator.clipboard.writeText(icalFeedUrl.value);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

async function regenerateToken() {
  if (!campaign.activeCampaignId) return;
  const confirmed = window.confirm(
    "Regenerating the URL will break all existing calendar subscriptions. Everyone will need to re-subscribe with the new URL. Continue?",
  );
  if (!confirmed) return;
  await doRegenerateToken(campaign.activeCampaignId);
}

// Built by the same module the subscribed feed uses (`@edge-shared/ics.ts`), so
// the file a DM downloads and the feed a player subscribes to are byte-for-byte
// the same events. They used to be two hand-rolled builders and had drifted:
// this one emitted no DTEND, no DTSTAMP and no text escaping, so a session
// titled "Ambush, at last" exported a file some clients refused outright.

function toIcsEvent(p: SessionProposal): IcsSessionEvent {
  return {
    id: p.id,
    title: p.title,
    notes: p.notes,
    date: p.proposed_date,
    time: p.proposed_time,
    durationMinutes: p.duration_minutes,
    status: p.status === "confirmed" ? "confirmed" : "proposed",
  };
}

// The regular evenings as one repeating event, less every evening a moved or
// cancelled row replaced; the subscribed feed builds the same.
function cadenceSeries(): IcsSeries | null {
  if (!cadence) return null;
  return {
    id: cadence.id,
    title: cadence.title,
    rule: cadence,
    time: cadence.start_time,
    durationMinutes: cadence.duration_minutes,
    exdates: proposals.flatMap((p) => (p.replaces_date ? [p.replaces_date] : [])),
  };
}

function exportIcal() {
  const events = proposals
    .filter((p) => p.status !== "cancelled" && p.proposed_date >= today.value)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
    .map(toIcsEvent);
  const body = buildSessionFeed({
    campaignName: campaignData.value?.name ?? "Grimoire",
    events,
    series: cadenceSeries(),
    now: new Date(),
    respondUrl: `${window.location.origin}/play/settings`,
  });
  downloadBlob(new Blob([body], { type: "text/calendar;charset=utf-8" }), "sessions.ics");
}
</script>
