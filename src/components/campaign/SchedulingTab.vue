<template>
  <div class="space-y-6">
    <!-- ── Upcoming confirmed sessions ─────────────────────────────────── -->
    <div v-if="confirmed.length > 0">
      <h3
        class="text-label-lg font-semibold text-muted-foreground uppercase mb-3"
      >
        Upcoming Sessions
      </h3>
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
              <AppInput v-model="editTitle" placeholder="Title" />
              <AppInput v-model.number="editDuration" type="number" min="0.5" step="0.5" placeholder="hours" />
            </div>
            <div class="flex justify-end gap-2">
              <AppButton variant="subtle" size="sm" label="Cancel" @click="editingId = null" />
              <AppButton variant="primary" size="sm" label="Save" :disabled="isUpdating" @click="saveEdit(p.id)" />
            </div>
          </div>
          <!-- Normal display -->
          <div v-else class="flex items-center gap-3 px-4 py-3">
            <IconCalendarCheck class="h-4 w-4 text-elven-green shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-sm font-semibold text-foreground">{{ p.title }}</p>
              <p class="text-caption text-muted-foreground">{{ formatDate(p.proposed_date, p.proposed_time) }}</p>
            </div>
            <AppButton as="span" variant="tinted" tone="success" size="xs" :label="`${availabilityCount(p.id)}/${playerCount} available`" />
            <AppButton variant="ghost" size="icon-xs" class="shrink-0" :icon="IconEdit" tooltip="Edit session" @click="startEdit(p)" />
            <AppButton variant="ghost" size="icon-xs" class="shrink-0 hover:text-destructive" :icon="IconClose" tooltip="Cancel session" @click="cancelSession(p)" />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Proposed dates ───────────────────────────────────────────────── -->
    <div>
      <h3
        class="text-label-lg font-semibold text-muted-foreground uppercase mb-1"
      >
        Proposed Dates
      </h3>
      <p class="text-caption text-muted-foreground mb-3">
        These go out to the party's subscribed calendars straight away, marked as
        suggestions, so nobody has to open Grimoire to see them.
      </p>

      <div
        v-if="proposed.length === 0"
        class="text-body text-muted-foreground italic py-2"
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
              <AppInput v-model="editTitle" placeholder="Title" />
              <AppInput v-model.number="editDuration" type="number" min="0.5" step="0.5" placeholder="hours" />
            </div>
            <div class="flex justify-end gap-2">
              <AppButton variant="subtle" size="sm" label="Cancel" @click="editingId = null" />
              <AppButton variant="primary" size="sm" label="Save" :disabled="isUpdating" @click="saveEdit(p.id)" />
            </div>
          </div>
          <!-- Normal display -->
          <div v-else>
            <div class="flex items-center gap-3 px-4 py-3">
              <IconCalendar class="h-4 w-4 text-primary shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-sm font-semibold text-foreground">{{ p.title }}</p>
                <p class="text-caption text-muted-foreground">{{ formatDate(p.proposed_date, p.proposed_time) }}</p>
              </div>
              <!-- Availability summary -->
              <AppButton
                as="span"
                size="xs"
                :variant="availabilityCount(p.id) >= p.min_attendance ? 'tinted' : 'chip'"
                tone="success"
                :label="`${availabilityCount(p.id)}/${playerCount}`"
              />
              <!-- Actions -->
              <div class="flex items-center gap-1 shrink-0">
                <AppButton
                  variant="tinted"
                  tone="success"
                  emphasis="soft"
                  size="xs"
                  :icon="IconCheck"
                  label="Confirm"
                  :disabled="isUpdating"
                  @click="confirmSession(p)"
                />
                <AppButton variant="ghost" size="icon-xs" :icon="IconEdit" tooltip="Edit" @click="startEdit(p)" />
                <AppButton variant="ghost" size="icon-xs" class="hover:text-destructive" :icon="IconDelete" tooltip="Remove" @click="removeProposal(p.id)" />
              </div>
            </div>
            <!-- Per-member availability breakdown -->
            <div v-if="playerCount > 0" class="border-t border-border px-4 py-2 flex flex-wrap gap-2">
              <div v-for="member in players" :key="member.id" class="flex items-center gap-1">
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="getMemberAvailability(p.id, member.user_id) === true ? 'bg-elven-green' : getMemberAvailability(p.id, member.user_id) === false ? 'bg-destructive' : 'bg-muted-foreground/40'"
                />
                <span class="text-caption text-muted-foreground">{{ member.display_name || "(unnamed)" }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Add proposed date ────────────────────────────────────────────── -->
    <div class="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <h3
        class="text-label-lg font-semibold text-muted-foreground uppercase"
      >
        Add Proposed Date
      </h3>

      <div>
        <label
          class="block text-label text-muted-foreground mb-1"
          >DATE &amp; TIME</label
        >
        <VueDatePicker
          v-model="form.proposed_datetime"
          :dark="isDark"
          :enable-time-picker="true"
          :teleport="true"
          :min-date="minDate"
          :start-time="{ hours: 19, minutes: 0 }"
          placeholder="Pick a date & time…"
          class="grimoire-datepicker"
        />
      </div>

      <div>
        <label
          class="block text-eyebrow text-muted-foreground mb-1"
          >TITLE</label
        >
        <AppInput v-model="form.title" placeholder="Session 12…" />
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-label text-muted-foreground mb-1">NOTES (optional)</label>
          <AppInput v-model="form.notes" placeholder="Bring snacks…" />
        </div>
        <div>
          <label class="block text-label text-muted-foreground mb-1">DURATION (hours)</label>
          <AppInput v-model.number="form.duration_hours" type="number" min="0.5" step="0.5" />
        </div>
        <div>
          <label class="block text-eyebrow text-muted-foreground mb-1">MIN ATTENDANCE</label>
          <AppInput v-model.number="form.min_attendance" type="number" min="1" :max="playerCount || 10" />
        </div>
      </div>

      <div class="flex justify-end">
        <AppButton
          variant="primary"
          size="md"
          :disabled="!form.proposed_datetime || isCreating"
          :icon="IconAdd"
          :label="isCreating ? 'Adding…' : 'Add Date'"
          @click="addProposal"
        />
      </div>
    </div>

    <!-- ── Past / cancelled ─────────────────────────────────────────────── -->
    <div v-if="cancelled.length > 0">
      <h3
        class="text-label-lg font-semibold text-muted-foreground uppercase mb-2"
      >
        Cancelled
      </h3>
      <div class="space-y-1">
        <div
          v-for="p in cancelled"
          :key="p.id"
          class="flex items-center gap-3 px-4 py-2 rounded-lg border border-border/50 opacity-50"
        >
          <IconRemoveEvent class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-body text-muted-foreground line-through">
              {{ p.title }}
            </p>
            <p class="text-caption text-muted-foreground">
              {{ formatDate(p.proposed_date, p.proposed_time) }}
            </p>
          </div>
          <AppButton
            variant="ghost"
            size="icon-xs"
            class="shrink-0 hover:text-destructive"
            :icon="IconDelete"
            tooltip="Delete"
            @click="removeProposal(p.id)"
          />
        </div>
      </div>
    </div>

    <!-- ── Calendar subscription ──────────────────────────────────────── -->
    <div
      v-if="icalFeedUrl"
      class="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
    >
      <h3
        class="text-label-lg font-semibold text-muted-foreground uppercase"
      >
        Calendar Subscription
      </h3>
      <p class="text-caption text-muted-foreground">
        Subscribe once and your calendar app will automatically receive future
        session updates — confirmed dates as normal events, and dates you have
        only suggested as tentative ones that leave the evening free.
      </p>

      <!-- URL field + copy -->
      <div class="flex items-center gap-2">
        <input
          :value="icalFeedUrl"
          readonly
          class="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-mono text-xs text-muted-foreground select-all focus:outline-none focus:ring-1 focus:ring-ring truncate"
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
          tooltip="A one-off snapshot of the same events — it will not update"
          label="Download .ics"
          @click="exportIcal"
        />

        <AppButton
          v-if="isDM"
          variant="subtle"
          size="sm"
          class="hover:text-destructive hover:border-destructive"
          :disabled="isRegenerating"
          :icon="IconRefresh"
          tooltip="Generate a new URL — existing subscriptions will stop updating"
          :label="isRegenerating ? 'Regenerating…' : 'Regenerate URL'"
          @click="regenerateToken"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import "@/assets/vendor/datepicker.css";
import { useTheme } from "@/composables/useTheme";
import { IconAdd, IconAddEvent, IconCalendar, IconCalendarCheck, IconCheck, IconClose, IconCopy, IconDelete, IconDownload, IconEdit, IconRefresh, IconRemoveEvent } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import {
  useSessionProposals,
  useAllSessionAvailability,
  useCreateProposal,
  useUpdateProposal,
  useDeleteProposal,
} from "@/composables/calendar/useScheduling";
import {
  useCampaignById,
  useRegenerateIcalToken,
} from "@/composables/campaign/useCampaigns";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { notifyProposalCreated } from "@/composables/campaign/useEmailNotify";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import type { SessionProposal } from "@/types/scheduling.types";
import { buildSessionFeed, type IcsSessionEvent } from "@edge-shared/ics.ts";

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

const today = useLocalToday();

const confirmed = computed(() =>
  (proposals.value ?? [])
    .filter((p) => p.status === "confirmed" && p.proposed_date >= today.value)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date)),
);
const proposed = computed(() =>
  (proposals.value ?? [])
    .filter((p) => p.status === "proposed" && p.proposed_date >= today.value)
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

// Earliest selectable DATE — start of today. Must be date-only (00:00): using
// `new Date()` (current time) makes VueDatePicker clamp the time-of-day to the
// minimum on today's date, which during late-night use pins fresh picks to the
// current hour (e.g. "02:00") and fights manual time selection.
const minDate = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
});

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
  const created = await createProposal({
    campaign_id: campaign.activeCampaignId,
    proposed_date,
    proposed_time,
    title: form.value.title || "Session",
    notes: form.value.notes || null,
    status: "proposed",
    duration_minutes: Math.round(form.value.duration_hours * 60),
    min_attendance: form.value.min_attendance,
  });
  void sendCampaignAnnouncement(
    campaign.activeCampaignId,
    `📅 Session date proposed: ${created.title} — ${formatDate(created.proposed_date, created.proposed_time)}`,
  );
  notifyProposalCreated(created.id);
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

function exportIcal() {
  const events = [...confirmed.value, ...proposed.value]
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))
    .map(toIcsEvent);
  const body = buildSessionFeed({
    campaignName: campaignData.value?.name ?? "Grimoire",
    events,
    now: new Date(),
    respondUrl: `${window.location.origin}/play/settings`,
  });
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
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

