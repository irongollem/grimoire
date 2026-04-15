<template>
  <div class="space-y-6">
    <!-- ── Upcoming confirmed sessions ─────────────────────────────────── -->
    <div v-if="confirmed.length > 0">
      <div class="flex items-center justify-between mb-3">
        <h3
          class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
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
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <!-- Edit form -->
          <div v-if="editingId === p.id" class="px-4 py-3 space-y-2">
            <VueDatePicker v-model="editDatetime" :dark="true" :enable-time-picker="true" :teleport="true" placeholder="Pick a date & time…" class="grimoire-datepicker" />
            <div class="grid grid-cols-2 gap-2">
              <input v-model="editTitle" type="text" placeholder="Title" class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              <input v-model.number="editDuration" type="number" min="0.5" step="0.5" placeholder="hours" class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div class="flex justify-end gap-2">
              <button class="px-3 py-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground border border-border rounded hover:text-foreground transition-colors" @click="editingId = null">Cancel</button>
              <button class="px-3 py-1.5 font-cinzel text-[10px] tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity" :disabled="isUpdating" @click="saveEdit(p.id)">Save</button>
            </div>
          </div>
          <!-- Normal display -->
          <div v-else class="flex items-center gap-3 px-4 py-3">
            <CalendarCheck class="h-4 w-4 text-elven-green shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-sm font-semibold text-foreground">{{ p.title }}</p>
              <p class="font-fell text-xs text-muted-foreground">{{ formatDate(p.proposed_date, p.proposed_time) }}</p>
            </div>
            <span class="font-cinzel text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-elven-green/15 text-elven-green">
              {{ availabilityCount(p.id) }}/{{ playerCount }} available
            </span>
            <button class="text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Edit session" @click="startEdit(p)">
              <Pencil class="h-3.5 w-3.5" />
            </button>
            <button class="text-muted-foreground hover:text-destructive transition-colors shrink-0" title="Cancel session" @click="cancelSession(p)">
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Proposed dates ───────────────────────────────────────────────── -->
    <div>
      <h3
        class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3"
      >
        Proposed Dates
      </h3>

      <div
        v-if="proposed.length === 0"
        class="font-fell text-sm text-muted-foreground italic py-2"
      >
        No proposed dates yet. Add one below.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="p in proposed"
          :key="p.id"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <!-- Edit form -->
          <div v-if="editingId === p.id" class="px-4 py-3 space-y-2">
            <VueDatePicker v-model="editDatetime" :dark="true" :enable-time-picker="true" :teleport="true" placeholder="Pick a date & time…" class="grimoire-datepicker" />
            <div class="grid grid-cols-2 gap-2">
              <input v-model="editTitle" type="text" placeholder="Title" class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              <input v-model.number="editDuration" type="number" min="0.5" step="0.5" placeholder="hours" class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div class="flex justify-end gap-2">
              <button class="px-3 py-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground border border-border rounded hover:text-foreground transition-colors" @click="editingId = null">Cancel</button>
              <button class="px-3 py-1.5 font-cinzel text-[10px] tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity" :disabled="isUpdating" @click="saveEdit(p.id)">Save</button>
            </div>
          </div>
          <!-- Normal display -->
          <div v-else>
            <div class="flex items-center gap-3 px-4 py-3">
              <Calendar class="h-4 w-4 text-primary shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-sm font-semibold text-foreground">{{ p.title }}</p>
                <p class="font-fell text-xs text-muted-foreground">{{ formatDate(p.proposed_date, p.proposed_time) }}</p>
              </div>
              <!-- Availability summary -->
              <span
                class="font-cinzel text-[10px] tracking-wider px-1.5 py-0.5 rounded"
                :class="availabilityCount(p.id) >= p.min_attendance ? 'bg-elven-green/15 text-elven-green' : 'bg-muted text-muted-foreground'"
              >
                {{ availabilityCount(p.id) }}/{{ playerCount }}
              </span>
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
                <button class="p-1 text-muted-foreground hover:text-foreground transition-colors rounded" title="Edit" @click="startEdit(p)">
                  <Pencil class="h-3.5 w-3.5" />
                </button>
                <button class="p-1 text-muted-foreground hover:text-destructive transition-colors rounded" title="Remove" @click="removeProposal(p.id)">
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <!-- Per-member availability breakdown -->
            <div v-if="playerCount > 0" class="border-t border-border px-4 py-2 flex flex-wrap gap-2">
              <div v-for="member in players" :key="member.id" class="flex items-center gap-1">
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="getMemberAvailability(p.id, member.user_id) === true ? 'bg-elven-green' : getMemberAvailability(p.id, member.user_id) === false ? 'bg-destructive' : 'bg-muted-foreground/40'"
                />
                <span class="font-fell text-[11px] text-muted-foreground">{{ member.display_name || "(unnamed)" }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Add proposed date ────────────────────────────────────────────── -->
    <div class="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <h3
        class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase"
      >
        Add Proposed Date
      </h3>

      <div>
        <label
          class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1"
          >DATE &amp; TIME</label
        >
        <VueDatePicker
          v-model="form.proposed_datetime"
          :dark="isDark"
          :enable-time-picker="true"
          :teleport="true"
          :min-date="new Date()"
          placeholder="Pick a date & time…"
          class="grimoire-datepicker"
        />
      </div>

      <div>
        <label
          class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1"
          >TITLE</label
        >
        <input
          v-model="form.title"
          type="text"
          placeholder="Session 12…"
          class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div class="grid grid-cols-3 gap-3">
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
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">DURATION (hours)</label>
          <input
            v-model.number="form.duration_hours"
            type="number"
            min="0.5"
            step="0.5"
            class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
          :disabled="!form.proposed_datetime || isCreating"
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
      <h3
        class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2"
      >
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
            <p class="font-fell text-sm text-muted-foreground line-through">
              {{ p.title }}
            </p>
            <p class="font-fell text-xs text-muted-foreground">
              {{ formatDate(p.proposed_date, p.proposed_time) }}
            </p>
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
    <div
      v-if="icalFeedUrl"
      class="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
    >
      <h3
        class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase"
      >
        Calendar Subscription
      </h3>
      <p class="font-fell text-xs text-muted-foreground">
        Subscribe once and your calendar app will automatically receive future
        session updates.
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
          {{ copied ? "Copied" : "Copy" }}
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
          {{ isRegenerating ? "Regenerating…" : "Regenerate URL" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import { useTheme } from "@/composables/useTheme";
import {
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  Check,
  Copy,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-vue-next";
import {
  useSessionProposals,
  useAllSessionAvailability,
  useCreateProposal,
  useUpdateProposal,
  useDeleteProposal,
} from "@/composables/useScheduling";
import {
  useCampaignById,
  useRegenerateIcalToken,
} from "@/composables/useCampaigns";
import { useCampaignMembers } from "@/composables/useCampaignMembers";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { SessionProposal } from "@/types/scheduling.types";

const { activeThemeId } = useTheme();
const isDark = computed(() => activeThemeId.value === "grimoire");

const campaign = useCampaignStore();
const auth = useAuthStore();
const { data: proposals } = useSessionProposals();
const { data: allAvailability } = useAllSessionAvailability();
const { data: members } = useCampaignMembers();
const { data: campaignData } = useCampaignById(() => campaign.activeCampaignId);
const { mutateAsync: createProposal, isPending: isCreating } =
  useCreateProposal();
const { mutateAsync: updateProposal, isPending: isUpdating } =
  useUpdateProposal();
const { mutateAsync: deleteProposal } = useDeleteProposal();
const { mutateAsync: doRegenerateToken, isPending: isRegenerating } =
  useRegenerateIcalToken();

// ── Computed ──────────────────────────────────────────────────────────────────

const isDM = computed(() => auth.isDM);

const icalFeedUrl = computed(() => {
  const token = campaignData.value?.ical_token;
  if (!token) return null;
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/ical-feed/${token}`;
});

const webcalUrl = computed(() => {
  return icalFeedUrl.value?.replace(/^https?:\/\//, "webcal://") ?? undefined;
});

const players = computed(() =>
  (members.value ?? []).filter((m) => m.role === "player"),
);
const playerCount = computed(() => players.value.length);

const today = new Date().toISOString().slice(0, 10);

const confirmed = computed(() =>
  (proposals.value ?? [])
    .filter((p) => p.status === "confirmed" && p.proposed_date >= today)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date)),
);
const proposed = computed(() =>
  (proposals.value ?? [])
    .filter((p) => p.status === "proposed" && p.proposed_date >= today)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date)),
);
const cancelled = computed(() =>
  (proposals.value ?? []).filter((p) => p.status === "cancelled"),
);

function availabilityCount(proposalId: string): number {
  return (allAvailability.value ?? []).filter(
    (a) => a.session_proposal_id === proposalId && a.available,
  ).length;
}

function getMemberAvailability(
  proposalId: string,
  userId: string,
): boolean | null {
  const row = (allAvailability.value ?? []).find(
    (a) => a.session_proposal_id === proposalId && a.user_id === userId,
  );
  return row ? row.available : null;
}

// ── Form ──────────────────────────────────────────────────────────────────────

const form = ref({
  proposed_datetime: null as Date | null,
  title: "Session",
  notes: "",
  duration_hours: 4,
  min_attendance: 1,
});

function resetForm() {
  form.value = {
    proposed_datetime: null,
    title: "Session",
    notes: "",
    duration_hours: 4,
    min_attendance: 1,
  };
}

// ── Inline edit ───────────────────────────────────────────────────────────────

const editingId       = ref<string | null>(null);
const editDatetime    = ref<Date | null>(null);
const editTitle       = ref("");
const editDuration    = ref(240);

function startEdit(p: SessionProposal) {
  editingId.value    = p.id;
  editTitle.value    = p.title;
  editDuration.value = (p.duration_minutes ?? 240) / 60;
  if (p.proposed_date && p.proposed_time) {
    editDatetime.value = new Date(`${p.proposed_date}T${p.proposed_time}`);
  } else if (p.proposed_date) {
    editDatetime.value = new Date(`${p.proposed_date}T00:00`);
  } else {
    editDatetime.value = null;
  }
}

async function saveEdit(id: string) {
  const dt = editDatetime.value;
  if (!dt) return;
  const pad = (n: number) => String(n).padStart(2, "0");
  const proposed_date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const proposed_time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  await updateProposal({ id, update: { title: editTitle.value, proposed_date, proposed_time, duration_minutes: Math.round(editDuration.value * 60) } });
  editingId.value = null;
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function addProposal() {
  const dt = form.value.proposed_datetime;
  if (!dt || !campaign.activeCampaignId) return;
  const pad = (n: number) => String(n).padStart(2, "0");
  const proposed_date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const proposed_time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  await createProposal({
    campaign_id: campaign.activeCampaignId,
    proposed_date,
    proposed_time,
    title: form.value.title || "Session",
    notes: form.value.notes || null,
    status: "proposed",
    duration_minutes: Math.round(form.value.duration_hours * 60),
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
  const blob = new Blob([lines.join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
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
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  if (!time) return dateStr;
  const [h, m] = time.split(":");
  const t = new Date();
  t.setHours(Number(h), Number(m));
  return `${dateStr} · ${t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}
</script>

<style>
/* Override vue-datepicker vars using the app's theme CSS vars.
   Not scoped — the menu teleports to <body>. Using :root so vars cascade there too. */
:root {
  --dp-background-color: var(--card);
  --dp-text-color: var(--card-foreground);
  --dp-hover-color: var(--muted);
  --dp-hover-text-color: var(--foreground);
  --dp-hover-icon-color: var(--foreground);
  --dp-primary-color: var(--primary);
  --dp-primary-disabled-color: color-mix(in oklch, var(--primary) 40%, transparent);
  --dp-primary-text-color: var(--primary-foreground);
  --dp-secondary-color: var(--muted);
  --dp-border-color: var(--border);
  --dp-menu-border-color: var(--border);
  --dp-border-color-hover: var(--ring);
  --dp-border-color-focus: var(--ring);
  --dp-disabled-color: var(--muted);
  --dp-disabled-color-text: var(--muted-foreground);
  --dp-scroll-bar-background: var(--muted);
  --dp-scroll-bar-color: var(--border);
  --dp-success-color: hsl(142 60% 40%);
  --dp-icon-color: var(--muted-foreground);
  --dp-danger-color: var(--destructive);
  --dp-highlight-color: color-mix(in oklch, var(--primary) 15%, transparent);
  --dp-font-family: "Crimson Pro", Georgia, serif;
  --dp-font-size: 0.875rem;
  --dp-border-radius: 0.375rem;
  --dp-input-padding: 0.5rem 0.75rem;
}

/* ── Input field ───────────────────────────────────────────────────────── */
.grimoire-datepicker .dp__input {
  background-color: var(--background) !important;
  border-color: var(--border) !important;
  color: var(--foreground) !important;
  font-family: "Crimson Pro", Georgia, serif !important;
  font-size: 0.875rem !important;
  border-radius: 0.375rem !important;
  padding: 0.5rem 0.75rem 0.5rem 2.25rem !important;
  height: auto !important;
}
.grimoire-datepicker .dp__input:hover,
.grimoire-datepicker .dp__input_focus {
  border-color: var(--ring) !important;
  box-shadow: 0 0 0 1px var(--ring) !important;
}
.grimoire-datepicker .dp__input_icon {
  color: var(--muted-foreground) !important;
}
.grimoire-datepicker .dp__input_wrap {
  border-radius: 0.375rem;
}

/* ── Teleported calendar menu — theme-agnostic, driven by --dp-* vars ─── */
.dp__menu,
.dp__menu_inner {
  background-color: var(--card) !important;
  border-color: var(--border) !important;
  color: var(--card-foreground) !important;
  font-family: "Crimson Pro", Georgia, serif !important;
}
.dp__calendar_header_item,
.dp__cell_inner,
.dp__month_year_select {
  color: var(--foreground) !important;
  font-family: "Crimson Pro", Georgia, serif !important;
}
.dp__today {
  border-color: var(--primary) !important;
}
.dp__active_date,
.dp__overlay_cell_active {
  background: var(--primary) !important;
  color: var(--primary-foreground) !important;
}
.dp__date_hover:hover,
.dp__date_hover_start:hover,
.dp__date_hover_end:hover,
.dp__overlay_cell:hover {
  background: var(--muted) !important;
  color: var(--foreground) !important;
}
.dp__cell_disabled {
  color: var(--muted-foreground) !important;
  opacity: 0.5;
}
.dp__nav_btn,
.dp__inner_nav {
  color: var(--muted-foreground) !important;
}
.dp__nav_btn:hover {
  background: var(--muted) !important;
}
.dp__overlay {
  background-color: var(--card) !important;
  border-color: var(--border) !important;
}
.dp__time_col,
.dp__time_display {
  color: var(--foreground) !important;
}
.dp__time_col_btn:hover {
  background: var(--muted) !important;
}
.dp__action_select {
  background: var(--primary) !important;
  color: var(--primary-foreground) !important;
  border-radius: 0.375rem !important;
  font-family: "Cinzel", Georgia, serif !important;
  font-size: 0.7rem !important;
  letter-spacing: 0.05em !important;
}
.dp__action_cancel {
  color: var(--muted-foreground) !important;
  border-color: var(--border) !important;
  background: transparent !important;
  border-radius: 0.375rem !important;
  font-family: "Cinzel", Georgia, serif !important;
  font-size: 0.7rem !important;
  letter-spacing: 0.05em !important;
}
.dp__action_cancel:hover {
  color: var(--foreground) !important;
  border-color: var(--ring) !important;
}
</style>
