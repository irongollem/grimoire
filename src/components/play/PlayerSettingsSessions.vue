<template>
  <!-- Upcoming sessions -->
  <SettingsSection title="Upcoming Sessions">
    <div v-if="!confirmedSessions.length" class="font-fell text-sm text-muted-foreground italic">
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
          <p class="font-fell text-xs text-muted-foreground">{{ formatSessionDate(s.proposed_date, s.proposed_time) }}</p>
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
          <p class="font-fell text-xs text-muted-foreground">{{ formatSessionDate(s.proposed_date, s.proposed_time) }}</p>
        </div>
        <!-- 3-way toggle -->
        <div class="flex items-center gap-1 shrink-0">
          <button
            class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-2xs md:text-sm tracking-wider border transition-colors"
            :class="myAvailability(s.id) === true
              ? 'border-elven-green/50 bg-elven-green/15 text-elven-green'
              : 'border-border text-muted-foreground hover:border-elven-green/30 hover:text-elven-green'"
            @click="setAvailability(s, true)"
          >
            <IconCheck class="h-3 w-3" />
            Yes
          </button>
          <button
            class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-2xs md:text-sm tracking-wider border transition-colors"
            :class="myAvailability(s.id) === false
              ? 'border-destructive/50 bg-destructive/10 text-destructive'
              : 'border-border text-muted-foreground hover:border-destructive/30 hover:text-destructive'"
            @click="setAvailability(s, false)"
          >
            <IconClose class="h-3 w-3" />
            No
          </button>
        </div>
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import { IconCalendarCheck, IconCheck, IconClose } from "@/lib/icons";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useSessionProposals, useAllSessionAvailability, useUpsertAvailability } from "@/composables/useScheduling";
import type { SessionProposal } from "@/types/scheduling.types";

const auth = useAuthStore();
const campaign = useCampaignStore();

const { data: proposals } = useSessionProposals();
const { data: allAvailability } = useAllSessionAvailability();
const { mutateAsync: upsertAvailability } = useUpsertAvailability();

const today = new Date().toISOString().slice(0, 10);

const confirmedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "confirmed" && p.proposed_date >= today)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);

const proposedSessions = computed(() =>
  (proposals.value ?? [])
    .filter(p => p.status === "proposed" && p.proposed_date >= today)
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
