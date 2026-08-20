<template>
  <!-- Upcoming sessions -->
  <SettingsSection title="Upcoming Sessions">
    <div v-if="!confirmedSessions.length" class="text-body text-muted-foreground italic">
      No confirmed sessions yet — check back when your DM books one.
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="s in confirmedSessions"
        :key="s.id"
        class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5"
      >
        <IconCalendarCheck class="h-4 w-4 text-elven-green shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="font-cinzel text-sm font-semibold text-foreground">{{ s.title }}</p>
          <p class="text-caption text-muted-foreground">{{ formatSessionDate(s.proposed_date, s.proposed_time) }}</p>
        </div>
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
          <p class="font-cinzel text-sm font-semibold text-foreground">{{ s.title }}</p>
          <p class="text-caption text-muted-foreground">{{ formatSessionDate(s.proposed_date, s.proposed_time) }}</p>
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
import AppButton from "@/components/common/AppButton.vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import { IconCalendarCheck, IconCheck, IconClose } from "@/lib/icons";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useSessionProposals, useAllSessionAvailability, useUpsertAvailability } from "@/composables/useScheduling";
import { useLocalToday } from "@/composables/useLocalToday";
import type { SessionProposal } from "@/types/scheduling.types";

const auth = useAuthStore();
const campaign = useCampaignStore();

const { data: proposals } = useSessionProposals();
const { data: allAvailability } = useAllSessionAvailability();
const { mutateAsync: upsertAvailability } = useUpsertAvailability();

const today = useLocalToday();

const confirmedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "confirmed" && p.proposed_date >= today.value)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);

const proposedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "proposed" && p.proposed_date >= today.value)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);

function myAvailability(proposalId: string): boolean | null {
  const row = (allAvailability.value ?? [])
    .find(a => a.session_proposal_id === proposalId && a.user_id === auth.user?.id);
  return row ? row.available : null;
}

async function setAvailability(proposal: SessionProposal, available: boolean) {
  if (!campaign.activeCampaignId) return;
  await upsertAvailability({
    session_proposal_id: proposal.id,
    campaign_id: campaign.activeCampaignId,
    available,
  });
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
