<template>
  <section class="torn hearth-paper hearth-card rounded-lg p-3.5" aria-label="Next session">
    <div v-if="session" class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-eyebrow text-muted-foreground">{{ invite && !isRegular ? "Can you make it?" : "Next session" }}</span>
        <span
          class="inline-flex items-center gap-1.5 text-eyebrow"
          :class="session.status === 'proposed' ? 'text-ink-caution' : 'text-ink-success'"
        >
          <i class="inline-block h-1.5 w-1.5 rotate-45 bg-current" aria-hidden="true" />
          {{ STATUS_LABEL[session.status] }}
        </span>
      </div>

      <p class="hearth-display text-heading leading-snug">{{ dateLabel }}</p>
      <p class="flex items-center gap-1.5 text-caption text-muted-foreground">
        <IconClock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{{ [timeRange, countdown].filter(Boolean).join(" · ") }}</span>
      </p>
      <p v-if="session.title" class="text-body italic">{{ session.title }}</p>
      <p v-if="invite && !isRegular && tally.total > 0" class="text-caption text-muted-foreground">
        Needs {{ session.minAttendance }} of {{ tally.total }} to go ahead
      </p>
      <p v-else-if="tally.total > 0" class="text-caption text-muted-foreground">
        {{ tally.yes }} of {{ tally.total }} coming<template v-if="mine === true || (isRegular && choice === 'in')">, you too</template>
      </p>

      <SegmentedControl
        :model-value="choice"
        :options="RSVP_OPTIONS"
        size="md"
        block
        class="mt-1"
        role="group"
        aria-label="Can you make it?"
        :disabled="appUi.dmPreviewMode"
        @update:model-value="answer"
      />
      <p v-if="appUi.dmPreviewMode" class="text-caption italic text-muted-foreground">The player answers here.</p>
      <p v-if="answerFailed" class="text-caption text-destructive" role="alert">
        Your answer did not save. Try again.
      </p>
    </div>

    <template v-else-if="isLoading">
      <span class="text-eyebrow text-muted-foreground">Next session</span>
      <BannerLoader class="mt-2 h-5" />
    </template>

    <template v-else>
      <span class="text-eyebrow text-muted-foreground">Next session</span>
      <p class="mt-1 text-body italic text-muted-foreground">No session on the calendar yet.</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import "./hearth-paper.css";
import { computed } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { IconClock } from "@/lib/icons";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import {
  useAllSessionAvailability,
  useSessionAbsences,
  useSessionCadence,
  useSessionProposals,
  useSetAbsence,
  useUpsertAvailability,
} from "@/composables/calendar/useScheduling";
import {
  absenceTally,
  countdownLabel,
  daysUntil,
  myRsvp,
  pickNextSession,
  rsvpTally,
  sessionTimeRange,
} from "@/lib/calendar/nextSession";

/**
 * The next real-world session, with the answer to "can you make it?" right on
 * the card. The data is a boolean per player, so there are two answers and no
 * "maybe". In DM preview the answer is the player's to give: the control is
 * disabled, so a DM never RSVPs under their own account. `invite` is the first-visit step: the question leads, and the card
 * says how many are needed rather than how many are coming.
 */
const { invite = false } = defineProps<{ invite?: boolean }>();

type Choice = "in" | "out";
const RSVP_OPTIONS = [
  { value: "in", label: "I'm in" },
  { value: "out", label: "Can't make it" },
] as const;

const auth = useAuthStore();
const appUi = useAppUiStore();
const campaign = useCampaignStore();
const today = useLocalToday();
const { data: proposals, isLoading: proposalsLoading } = useSessionProposals();
const { data: availability, isLoading: availabilityLoading } = useAllSessionAvailability();
const { data: members } = useCampaignMembers();
const { data: cadence, isLoading: cadenceLoading } = useSessionCadence();
const { data: absences } = useSessionAbsences();
const rsvp = useUpsertAvailability();
const setAbsence = useSetAbsence();

const STATUS_LABEL = { regular: "Regular", proposed: "Proposed", confirmed: "Confirmed" } as const;

const isLoading = computed(() => proposalsLoading.value || availabilityLoading.value || cadenceLoading.value);
const session = computed(() =>
  proposals.value ? pickNextSession(cadence.value, proposals.value, today.value) : null,
);
const isRegular = computed(() => session.value?.status === "regular");
const playerCount = computed(() => (members.value ?? []).filter((m) => m.role === "player").length);
const answerFailed = computed(() => (isRegular.value ? setAbsence.isError.value : rsvp.isError.value));

const tally = computed(() => {
  const s = session.value;
  if (!s) return { yes: 0, answered: 0, total: 0 };
  if (!s.proposal) return absenceTally(absences.value ?? [], s.date, playerCount.value);
  return rsvpTally(availability.value ?? [], s.proposal.id, playerCount.value);
});
// A regular evening has no "yes": the player is coming unless they have an absence row.
const mine = computed(() => {
  const s = session.value;
  if (!s?.proposal || appUi.dmPreviewMode) return null;
  return myRsvp(availability.value ?? [], s.proposal.id, auth.user?.id);
});
const choice = computed<Choice | "">(() => {
  const s = session.value;
  if (s && !s.proposal) {
    if (appUi.dmPreviewMode) return "";
    const out = (absences.value ?? []).some((a) => a.user_id === auth.user?.id && a.absent_on === s.date);
    return out ? "out" : "in";
  }
  return mine.value === null ? "" : mine.value ? "in" : "out";
});

const dateLabel = computed(() => {
  if (!session.value) return "";
  const [y, m, d] = session.value.date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
});
const timeRange = computed(() => (session.value ? sessionTimeRange(session.value) : null));
const countdown = computed(() =>
  session.value ? countdownLabel(daysUntil(session.value.date, today.value)) : "",
);

function answer(value: Choice | "") {
  const target = session.value;
  const campaignId = campaign.activeCampaignId;
  if (appUi.dmPreviewMode || !target || !campaignId || value === "") return;
  if (!target.proposal) {
    setAbsence.mutate({ campaignId, date: target.date, absent: value === "out" });
    return;
  }
  rsvp.mutate({ session_proposal_id: target.proposal.id, campaign_id: campaignId, available: value === "in" });
}
</script>

<style scoped>
.hearth-display {
  font-family: "Cinzel", Georgia, serif;
}
</style>
