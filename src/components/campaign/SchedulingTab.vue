<template>
  <div class="space-y-6">
    <!-- ── Regular rhythm ───────────────────────────────────────────────── -->
    <CadenceEditor
      :cadence="cadence ?? null"
      :proposals="proposals ?? []"
      :today="today"
      :saving="isSavingCadence"
      @save="saveCadence"
      @remove="removeCadence"
    />

    <!-- ── Upcoming sessions: regular evenings and confirmed dates ──────── -->
    <div v-if="upcoming.length > 0">
      <h3
        class="text-label-lg font-semibold text-muted-foreground uppercase mb-3"
      >
        Upcoming Sessions
      </h3>
      <div class="space-y-2">
        <template v-for="row in upcoming" :key="row.key">
        <RegularEveningRow
          v-if="row.kind === 'regular'"
          :evening="row.evening"
          :when-label="formatDate(row.evening.date, row.evening.time)"
          :absent-names="absentNames(row.evening.date)"
          :player-count="playerCount"
          :busy="isCreating"
          @move="(to) => moveEvening(row.evening, to)"
          @cancel="cancelEvening(row.evening)"
        />
        <div
          v-else-if="row.kind === 'confirmed'"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <!-- Edit form -->
          <div v-if="editingId === row.proposal.id" class="px-4 py-3 space-y-2">
            <VueDatePicker v-model="editDatetime" :teleport="true" placeholder="Pick a date & time…" class="grimoire-datepicker" />
            <div class="grid grid-cols-2 gap-2">
              <AppInput v-model="editTitle" placeholder="Title" />
              <AppInput v-model.number="editDuration" type="number" min="0.5" step="0.5" placeholder="hours" />
            </div>
            <div class="flex justify-end gap-2">
              <AppButton variant="subtle" size="sm" label="Cancel" @click="editingId = null" />
              <AppButton variant="primary" size="sm" label="Save" :disabled="isUpdating" @click="saveEdit(row.proposal.id)" />
            </div>
          </div>
          <!-- Normal display -->
          <div v-else class="flex items-center gap-3 px-4 py-3">
            <IconCalendarCheck class="h-4 w-4 text-elven-green shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-heading-sm font-semibold text-foreground">{{ row.proposal.title }}</p>
              <p class="text-caption text-muted-foreground">{{ formatDate(row.proposal.proposed_date, row.proposal.proposed_time) }}</p>
            </div>
            <AppButton as="span" variant="tinted" tone="success" size="xs" :label="`${availabilityCount(row.proposal.id)}/${playerCount} available`" />
            <AppButton variant="ghost" size="icon-xs" class="shrink-0" :icon="IconEdit" tooltip="Edit session" @click="startEdit(row.proposal)" />
            <AppButton variant="ghost" size="icon-xs" class="shrink-0 hover:text-destructive" :icon="IconClose" tooltip="Cancel session" @click="cancelSession(row.proposal)" />
          </div>
        </div>
        </template>
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
            <VueDatePicker v-model="editDatetime" :teleport="true" placeholder="Pick a date & time…" class="grimoire-datepicker" />
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
                <p class="text-heading-sm font-semibold text-foreground">{{ p.title }}</p>
                <p class="text-caption text-muted-foreground">{{ formatDate(p.proposed_date, p.proposed_time) }}</p>
                <p v-if="p.replaces_date" class="text-caption text-muted-foreground">
                  Moved from {{ formatDate(p.replaces_date, null) }}
                </p>
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
                <AppButton variant="ghost" size="icon-xs" class="hover:text-destructive" :icon="IconDelete" 
                  :tooltip="p.replaces_date ? 'Remove this move and keep the regular evening' : 'Remove'"
                  @click="removeProposal(p.id)" />
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
          :teleport="true"
          :min-date="minDate"
          :time-config="{ startTime: { hours: 19, minutes: 0 } }"
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
            v-if="p.replaces_date"
            variant="subtle"
            size="xs"
            class="shrink-0"
            :icon="IconUndo"
            label="Restore"
            tooltip="Bring the regular evening back"
            @click="removeProposal(p.id)"
          />
          <AppButton
            v-else
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
    <CalendarSubscription :cadence="cadence ?? null" :proposals="proposals ?? []" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import "@/assets/vendor/datepicker.css";
import { IconAdd, IconCalendar, IconCalendarCheck, IconCheck, IconClose, IconDelete, IconEdit, IconRemoveEvent, IconUndo } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CadenceEditor from "@/components/campaign/scheduling/CadenceEditor.vue";
import RegularEveningRow from "@/components/campaign/scheduling/RegularEveningRow.vue";
import CalendarSubscription from "@/components/campaign/scheduling/CalendarSubscription.vue";
import {
  useSessionProposals,
  useAllSessionAvailability,
  useCreateProposal,
  useUpdateProposal,
  useDeleteProposal,
  useSessionCadence,
  useSaveCadence,
  useDeleteCadence,
  useSessionAbsences,
} from "@/composables/calendar/useScheduling";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { notifyProposalCreated } from "@/composables/campaign/useEmailNotify";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { useConfirm } from "@/composables/useConfirm";
import { scheduledEvenings, type ScheduledEvening } from "@/lib/calendar/nextSession";
import type { SessionCadenceInput, SessionProposal } from "@/types/scheduling.types";

const campaign = useCampaignStore();
const { data: proposals } = useSessionProposals();
const { data: allAvailability } = useAllSessionAvailability();
const { data: members } = useCampaignMembers();
const { mutateAsync: createProposal, isPending: isCreating } =
  useCreateProposal();
const { mutateAsync: updateProposal, isPending: isUpdating } =
  useUpdateProposal();
const { mutateAsync: deleteProposal } = useDeleteProposal();
const { data: cadence } = useSessionCadence();
const { data: absences } = useSessionAbsences();
const { mutateAsync: doSaveCadence, isPending: isSavingCadence } = useSaveCadence();
const { mutateAsync: doDeleteCadence } = useDeleteCadence();
const { confirm } = useConfirm();

// ── Computed ──────────────────────────────────────────────────────────────────

const players = computed(() =>
  (members.value ?? []).filter((m) => m.role === "player"),
);
const playerCount = computed(() => players.value.length);

const today = useLocalToday();

type UpcomingRow =
  | { kind: "regular"; key: string; evening: ScheduledEvening }
  | { kind: "confirmed"; key: string; proposal: SessionProposal };

// Regular evenings and confirmed dates in one list. Proposed dates have their
// own section below, so they are left out here.
const upcoming = computed<UpcomingRow[]>(() =>
  scheduledEvenings(cadence.value, proposals.value ?? [], today.value, null, 8).flatMap((e): UpcomingRow[] => {
    if (e.status === "regular") return [{ kind: "regular", key: e.key, evening: e }];
    if (e.status === "confirmed" && e.proposal) return [{ kind: "confirmed", key: e.key, proposal: e.proposal }];
    return [];
  }),
);

function absentNames(date: string): string[] {
  const out = new Set((absences.value ?? []).filter((a) => a.absent_on === date).map((a) => a.user_id));
  return players.value.filter((m) => out.has(m.user_id)).map((m) => m.display_name || "(unnamed)");
}

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
    `📅 Session date proposed: ${created.title} · ${formatDate(created.proposed_date, created.proposed_time)}`,
  );
  notifyProposalCreated(created.id);
  resetForm();
}

function toDateAndTime(dt: Date): { date: string; time: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`,
    time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
  };
}

// A regular evening is moved by proposing the new date, which goes to the
// players like any proposal; `replaces_date` hides the original evening.
async function moveEvening(evening: ScheduledEvening, to: Date) {
  const cid = campaign.activeCampaignId;
  if (!cid) return;
  const { date, time } = toDateAndTime(to);
  const created = await createProposal({
    campaign_id: cid,
    proposed_date: date,
    proposed_time: time,
    title: evening.title,
    notes: null,
    status: "proposed",
    duration_minutes: evening.durationMinutes,
    min_attendance: 1,
    replaces_date: evening.date,
  });
  void sendCampaignAnnouncement(
    cid,
    `📅 ${created.title} moved from ${formatDate(evening.date, null)} to ${formatDate(created.proposed_date, created.proposed_time)}`,
  );
  notifyProposalCreated(created.id);
}

// Cancelling stays quiet: an in-app announcement, no email.
async function cancelEvening(evening: ScheduledEvening) {
  const cid = campaign.activeCampaignId;
  if (!cid) return;
  const ok = await confirm(
    `Nobody is emailed; players see it in the app. You can bring the evening back from the Cancelled list.`,
    { title: `Cancel ${formatDate(evening.date, null)}?`, confirmLabel: "Cancel evening" },
  );
  if (!ok) return;
  await createProposal({
    campaign_id: cid,
    proposed_date: evening.date,
    proposed_time: evening.time,
    title: evening.title,
    notes: null,
    status: "cancelled",
    duration_minutes: evening.durationMinutes,
    min_attendance: 1,
    replaces_date: evening.date,
  });
  void sendCampaignAnnouncement(cid, `📅 No session on ${formatDate(evening.date, null)}`);
}

async function saveCadence(input: SessionCadenceInput) {
  const cid = campaign.activeCampaignId;
  if (!cid) return;
  await doSaveCadence({ campaignId: cid, existingId: cadence.value?.id ?? null, input });
}

async function removeCadence() {
  if (!cadence.value) return;
  await doDeleteCadence(cadence.value.id);
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

