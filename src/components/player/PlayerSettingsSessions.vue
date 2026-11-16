<template>
  <!-- Upcoming sessions -->
  <SettingsSection title="Upcoming Sessions">
    <p v-if="rhythm" class="mb-3 text-body text-foreground">{{ rhythm }}</p>
    <div v-if="!upcoming.length" class="text-body text-muted-foreground italic">
      No confirmed sessions yet. Check back when your DM books one.
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="s in upcoming"
        :key="s.key"
        class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5"
      >
        <IconCalendarCheck class="h-4 w-4 text-elven-green shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-heading-sm font-semibold text-foreground">{{ s.title }}</p>
          <p class="text-caption text-muted-foreground">{{ formatSessionDate(s.date, s.time) }}</p>
        </div>
        <AppButton
          v-if="s.status === 'regular'"
          variant="subtle"
          size="xs"
          tone="danger"
          :active="isAbsent(s.date)"
          :icon="IconClose"
          icon-size="xs"
          label="Can't make it"
          @click="toggleAbsence(s.date)"
        />
      </div>
    </div>
  </SettingsSection>

  <!-- Session availability -->
  <SettingsSection
    v-if="proposedSessions.length > 0"
    title="Session Availability"
    description="Let your DM know when you can make it."
  >
    <div class="space-y-3">
      <div
        v-for="s in proposedSessions"
        :key="s.id"
        class="flex items-center gap-3"
      >
        <div class="flex-1 min-w-0">
          <p class="text-heading-sm font-semibold text-foreground">{{ s.title }}</p>
          <p class="text-caption text-muted-foreground">{{ formatSessionDate(s.proposed_date, s.proposed_time) }}</p>
          <p v-if="s.replaces_date" class="text-caption text-muted-foreground">
            Moved from {{ formatSessionDate(s.replaces_date, null) }}
          </p>
        </div>
        <!-- 3-way toggle -->
        <div class="flex items-center gap-1 shrink-0">
          <AppButton
            variant="subtle"
            size="xs"
            tone="success"
            :active="myAvailability(s.id) === true"
            :icon="IconCheck"
            icon-size="xs"
            label="Yes"
            @click="setAvailability(s, true)"
          />
          <AppButton
            variant="subtle"
            size="xs"
            tone="danger"
            :active="myAvailability(s.id) === false"
            :icon="IconClose"
            icon-size="xs"
            label="No"
            @click="setAvailability(s, false)"
          />
        </div>
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SettingsSection from "@/components/common/settings/SettingsSection.vue";
import { IconCalendarCheck, IconCheck, IconClose } from "@/lib/icons";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import {
  useAllSessionAvailability,
  useSessionAbsences,
  useSessionCadence,
  useSessionProposals,
  useSetAbsence,
  useUpsertAvailability,
} from "@/composables/calendar/useScheduling";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import type { SessionProposal } from "@/types/scheduling.types";
import { myRsvp, scheduledEvenings, sessionTimeRange } from "@/lib/calendar/nextSession";
import { describeCadence } from "@edge-shared/cadence.ts";
import { useToast } from "@/composables/useToast";

const auth = useAuthStore();
const campaign = useCampaignStore();

const { data: proposals } = useSessionProposals();
const { data: allAvailability } = useAllSessionAvailability();
const { mutateAsync: upsertAvailability } = useUpsertAvailability();
const toast = useToast();
const { data: cadence } = useSessionCadence();
const { data: absences } = useSessionAbsences();
const setAbsence = useSetAbsence();

const today = useLocalToday();

// Regular evenings and confirmed dates; a proposed date is answered below.
const upcoming = computed(() =>
  scheduledEvenings(cadence.value, proposals.value ?? [], today.value, null, 6).filter(
    (e) => e.status !== "proposed",
  ),
);

const rhythm = computed(() => {
  const c = cadence.value;
  if (!c) return null;
  const range = sessionTimeRange({ time: c.start_time, durationMinutes: c.duration_minutes });
  return range ? `${describeCadence(c)}, ${range}` : describeCadence(c);
});

function isAbsent(date: string): boolean {
  return (absences.value ?? []).some((a) => a.user_id === auth.user?.id && a.absent_on === date);
}

async function toggleAbsence(date: string) {
  if (!campaign.activeCampaignId) return;
  try {
    await setAbsence.mutateAsync({ campaignId: campaign.activeCampaignId, date, absent: !isAbsent(date) });
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't save that."));
  }
}

const proposedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "proposed" && p.proposed_date >= today.value)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);

function myAvailability(proposalId: string): boolean | null {
  return myRsvp(allAvailability.value ?? [], proposalId, auth.user?.id);
}

async function setAvailability(proposal: SessionProposal, available: boolean) {
  if (!campaign.activeCampaignId) return;
  try {
    await upsertAvailability({
      session_proposal_id: proposal.id,
      campaign_id: campaign.activeCampaignId,
      available,
    });
  } catch (error) {
    toast.error(toast.fromError(error, "Couldn't save your availability."));
  }
}

function formatSessionDate(date: string, time: string | null): string {
  const d = new Date(date + "T00:00:00");
  const dateStr = d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  if (!time) return dateStr;
  const [h, m] = time.split(":");
  const t = new Date();
  t.setHours(Number(h), Number(m));
  return `${dateStr} · ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}
</script>
