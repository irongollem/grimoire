<template>
  <div class="space-y-6">

    <!-- ── Upcoming confirmed sessions ─────────────────────────────────── -->
    <div v-if="confirmed.length > 0">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Upcoming Sessions
        </h3>
        <button
          class="inline-flex items-center gap-1 font-cinzel text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 transition-colors"
          @click="exportIcal"
        >
          <Download class="h-3 w-3" />
          Export iCal
        </button>
      </div>
      <div class="space-y-2">
        <div
          v-for="p in confirmed"
          :key="p.id"
          class="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <CalendarCheck class="h-4 w-4 text-elven-green shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground">{{ p.title }}</p>
            <p class="font-fell text-xs text-muted-foreground">{{ formatDate(p.proposed_date, p.proposed_time) }}</p>
          </div>
          <span class="font-cinzel text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-elven-green/15 text-elven-green">
            {{ availabilityCount(p.id) }}/{{ playerCount }} available
          </span>
          <button
            class="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title="Cancel session"
            @click="cancelSession(p)"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- ── Proposed dates ───────────────────────────────────────────────── -->
    <div>
      <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">
        Proposed Dates
      </h3>

      <div v-if="proposed.length === 0" class="font-fell text-sm text-muted-foreground italic py-2">
        No proposed dates yet. Add one below.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="p in proposed"
          :key="p.id"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <div class="flex items-center gap-3 px-4 py-3">
            <Calendar class="h-4 w-4 text-primary shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-sm font-semibold text-foreground">{{ p.title }}</p>
              <p class="font-fell text-xs text-muted-foreground">{{ formatDate(p.proposed_date, p.proposed_time) }}</p>
            </div>
            <!-- Availability summary -->
            <div class="flex items-center gap-1">
              <span
                class="font-cinzel text-[10px] tracking-wider px-1.5 py-0.5 rounded"
                :class="availabilityCount(p.id) >= p.min_attendance
                  ? 'bg-elven-green/15 text-elven-green'
                  : 'bg-muted text-muted-foreground'"
              >
                {{ availabilityCount(p.id) }}/{{ playerCount }}
              </span>
            </div>
            <!-- Actions -->
            <div class="flex items-center gap-1 shrink-0">
              <button
                class="inline-flex items-center gap-1 font-cinzel text-[10px] tracking-wider px-2 py-1 rounded bg-elven-green/15 text-elven-green hover:bg-elven-green/25 transition-colors"
                :disabled="isUpdating"
                @click="confirmSession(p)"
              >
                <Check class="h-3 w-3" />
                Confirm
              </button>
              <button
                class="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
                title="Remove proposed date"
                @click="removeProposal(p.id)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Per-member availability breakdown -->
          <div v-if="playerCount > 0" class="border-t border-border px-4 py-2 flex flex-wrap gap-2">
            <div
              v-for="member in players"
              :key="member.id"
              class="flex items-center gap-1"
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                :class="getMemberAvailability(p.id, member.user_id) === true
                  ? 'bg-elven-green'
                  : getMemberAvailability(p.id, member.user_id) === false
                    ? 'bg-destructive'
                    : 'bg-muted-foreground/40'"
              />
              <span class="font-fell text-[11px] text-muted-foreground">
                {{ member.display_name || '(unnamed)' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Add proposed date ────────────────────────────────────────────── -->
    <div class="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Add Proposed Date
      </h3>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">DATE</label>
          <input
            v-model="form.proposed_date"
            type="date"
            required
            class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">TIME (optional)</label>
          <input
            v-model="form.proposed_time"
            type="time"
            class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">TITLE</label>
        <input
          v-model="form.title"
          type="text"
          placeholder="Session 12…"
          class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">NOTES (optional)</label>
          <input
            v-model="form.notes"
            type="text"
            placeholder="Bring snacks…"
            class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">MIN ATTENDANCE</label>
          <input
            v-model.number="form.min_attendance"
            type="number"
            min="1"
            :max="playerCount || 10"
            class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div class="flex justify-end">
        <button
          :disabled="!form.proposed_date || isCreating"
          class="inline-flex items-center gap-1.5 px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
          @click="addProposal"
        >
          <Plus class="h-3.5 w-3.5" />
          {{ isCreating ? "Adding…" : "Add Date" }}
        </button>
      </div>
    </div>

    <!-- ── Past / cancelled ─────────────────────────────────────────────── -->
    <div v-if="cancelled.length > 0">
      <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">
        Cancelled
      </h3>
      <div class="space-y-1">
        <div
          v-for="p in cancelled"
          :key="p.id"
          class="flex items-center gap-3 px-4 py-2 rounded-lg border border-border/50 opacity-50"
        >
          <CalendarX class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-fell text-sm text-muted-foreground line-through">{{ p.title }}</p>
            <p class="font-fell text-xs text-muted-foreground">{{ formatDate(p.proposed_date, p.proposed_time) }}</p>
          </div>
          <button
            class="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title="Delete"
            @click="removeProposal(p.id)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- ── Calendar subscription ──────────────────────────────────────── -->
    <div v-if="icalFeedUrl" class="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <h3 class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Calendar Subscription
      </h3>
      <p class="font-fell text-xs text-muted-foreground">
        Subscribe once and your calendar app will automatically receive future session updates.
      </p>

      <!-- URL field + copy -->
      <div class="flex items-center gap-2">
        <input
          :value="icalFeedUrl"
          readonly
          class="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-mono text-xs text-muted-foreground select-all focus:outline-none focus:ring-1 focus:ring-ring truncate"
          @click="($event.target as HTMLInputElement).select()"
        />
        <button
          class="shrink-0 inline-flex items-center gap-1 font-cinzel text-[10px] tracking-wider px-2.5 py-1.5 rounded border border-border hover:bg-muted transition-colors"
          :title="copied ? 'Copied!' : 'Copy URL'"
          @click="copyUrl"
        >
          <Check v-if="copied" class="h-3 w-3 text-elven-green" />
          <Copy v-else class="h-3 w-3" />
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <a
          :href="webcalUrl"
          class="inline-flex items-center gap-1.5 font-cinzel text-[10px] tracking-wider px-3 py-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <CalendarPlus class="h-3 w-3" />
          Subscribe in Calendar App
        </a>

        <button
          v-if="isDM"
          class="inline-flex items-center gap-1.5 font-cinzel text-[10px] tracking-wider px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
          :disabled="isRegenerating"
          title="Generate a new URL — existing subscriptions will stop updating"
          @click="regenerateToken"
        >
          <RefreshCw class="h-3 w-3" />
          {{ isRegenerating ? 'Regenerating…' : 'Regenerate URL' }}
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Calendar, CalendarCheck, CalendarPlus, CalendarX, Check, Copy, Download, Plus, RefreshCw, Trash2, X } from "lucide-vue-next";
import {
  useSessionProposals,
  useAllSessionAvailability,
  useCreateProposal,
  useUpdateProposal,
  useDeleteProposal,
} from "@/composables/useScheduling";
import { useCampaignById, useRegenerateIcalToken } from "@/composables/useCampaigns";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { SessionProposal } from "@/types/scheduling.types";

const campaign = useCampaignStore();
const auth = useAuthStore();
const { data: proposals } = useSessionProposals();
const { data: allAvailability } = useAllSessionAvailability();
const { data: members } = useCampaignMembers();
const { data: campaignData } = useCampaignById(() => campaign.activeCampaignId);
const { mutateAsync: createProposal, isPending: isCreating } = useCreateProposal();
const { mutateAsync: updateProposal, isPending: isUpdating } = useUpdateProposal();
const { mutateAsync: deleteProposal } = useDeleteProposal();
const { mutateAsync: doRegenerateToken, isPending: isRegenerating } = useRegenerateIcalToken();

// ── Computed ──────────────────────────────────────────────────────────────────

const isDM = computed(() => auth.isDM);

const icalFeedUrl = computed(() => {
  const token = campaignData.value?.ical_token;
  if (!token) return null;
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/ical-feed/${token}`;
});

const webcalUrl = computed(() => {
  return icalFeedUrl.value?.replace(/^https?:\/\//, "webcal://") ?? null;
});

const players = computed(() =>
  (members.value ?? []).filter(m => m.role === "player")
);
const playerCount = computed(() => players.value.length);

const confirmed = computed(() =>
  (proposals.value ?? []).filter(p => p.status === "confirmed")
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);
const proposed = computed(() =>
  (proposals.value ?? []).filter(p => p.status === "proposed")
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
);
const cancelled = computed(() =>
  (proposals.value ?? []).filter(p => p.status === "cancelled")
);

function availabilityCount(proposalId: string): number {
  return (allAvailability.value ?? [])
    .filter(a => a.session_proposal_id === proposalId && a.available)
    .length;
}

function getMemberAvailability(proposalId: string, userId: string): boolean | null {
  const row = (allAvailability.value ?? [])
    .find(a => a.session_proposal_id === proposalId && a.user_id === userId);
  return row ? row.available : null;
}

// ── Form ──────────────────────────────────────────────────────────────────────

const form = ref({
  proposed_date: "",
  proposed_time: "",
  title: "Session",
  notes: "",
  min_attendance: 1,
});

function resetForm() {
  form.value = { proposed_date: "", proposed_time: "", title: "Session", notes: "", min_attendance: 1 };
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function addProposal() {
  if (!form.value.proposed_date || !campaign.activeCampaignId) return;
  await createProposal({
    campaign_id: campaign.activeCampaignId,
    proposed_date: form.value.proposed_date,
    proposed_time: form.value.proposed_time || null,
    title: form.value.title || "Session",
    notes: form.value.notes || null,
    status: "proposed",
    min_attendance: form.value.min_attendance,
  });
  resetForm();
}

async function confirmSession(p: SessionProposal) {
  await updateProposal({ id: p.id, update: { status: "confirmed" } });
}

async function cancelSession(p: SessionProposal) {
  await updateProposal({ id: p.id, update: { status: "cancelled" } });
}

async function removeProposal(id: string) {
  await deleteProposal(id);
}

// ── Calendar subscription ─────────────────────────────────────────────────────

const copied = ref(false);

async function copyUrl() {
  if (!icalFeedUrl.value) return;
  await navigator.clipboard.writeText(icalFeedUrl.value);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

async function regenerateToken() {
  if (!campaign.activeCampaignId) return;
  const confirmed = window.confirm(
    "Regenerating the URL will break all existing calendar subscriptions. Everyone will need to re-subscribe with the new URL. Continue?"
  );
  if (!confirmed) return;
  await doRegenerateToken(campaign.activeCampaignId);
}

// ── iCal export ───────────────────────────────────────────────────────────────

function exportIcal() {
  const sessions = confirmed.value;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Grimoire//DnD Campaign Manager//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const p of sessions) {
    const dateStr = p.proposed_date.replace(/-/g, "");
    const dtProp = p.proposed_time
      ? `DTSTART:${dateStr}T${p.proposed_time.replace(/:/g, "")}00`
      : `DTSTART;VALUE=DATE:${dateStr}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.id}@grimoire`,
      dtProp,
      `SUMMARY:${p.title}`,
      ...(p.notes ? [`DESCRIPTION:${p.notes}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sessions.ics";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatDate(date: string, time: string | null): string {
  const d = new Date(date + "T00:00:00");
  const dateStr = d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  if (!time) return dateStr;
  const [h, m] = time.split(":");
  const t = new Date();
  t.setHours(Number(h), Number(m));
  return `${dateStr} · ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}
</script>
