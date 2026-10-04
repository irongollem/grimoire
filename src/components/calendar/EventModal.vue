<template>
  <AppModal :open="open" size="md" :labelled-by="headingId" :backdrop-dismiss="false" @close="close">
    <!-- Header -->
    <header class="flex shrink-0 items-center justify-between px-5 py-4 border-b border-border">
      <div class="flex items-center gap-2">
        <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: editEvent ? eventColor(editEvent) : EVENT_TYPE_COLORS['campaign'] }" />
        <h2 :id="headingId" class="text-heading font-bold text-foreground">
          {{ isSessionNote ? (linkedNote?.title ?? 'Session Note') : (editEvent ? "Edit Event" : "New Event") }}
        </h2>
      </div>
      <AppButton variant="ghost" size="icon-xs" icon-size="md" :icon="IconClose" aria-label="Close" @click="close" />
    </header>

    <!-- Session note read-only view -->
    <template v-if="isSessionNote">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        <div v-if="linkedNoteLoading" class="flex justify-center py-8">
          <LoadingSpinner />
        </div>
        <template v-else-if="linkedNote">
          <!-- Meta badges -->
          <div class="flex flex-wrap gap-1.5">
            <span v-if="linkedNote.session_num" class="text-label bg-primary/10 text-primary rounded px-2 py-0.5">
              Session {{ linkedNote.session_num }}
            </span>
            <span v-if="linkedNote.session_real_date" class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5">
              {{ linkedNote.session_real_date }}
            </span>
            <span v-for="tag in linkedNote.tags" :key="tag" class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5">
              {{ tag }}
            </span>
          </div>
          <!-- Content -->
          <RichTextViewer :content="linkedNote.content" />
        </template>
        <p v-else class="text-body text-muted-foreground italic">Note not found.</p>
      </div>
      <!-- Footer -->
      <div class="shrink-0 flex items-center justify-between border-t border-border px-5 py-4">
        <AppButton variant="subtle" size="md" label="Close" @click="close" />
        <AppButton
          v-if="linkedNote"
          :to="`/notes/${linkedNote.id}`"
          variant="primary"
          size="md"
          label="Open in Notes →"
          @click="close"
        />
      </div>
    </template>

    <!-- Form -->
    <form v-else class="min-h-0 flex-1 flex flex-col overflow-hidden" @submit.prevent="submit">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        <!-- Title -->
        <div>
          <label
            class="block text-label-lg font-semibold text-muted-foreground mb-1"
          >
            TITLE
          </label>
          <AppInput
            v-model="form.title"
            required
            type="text"
            tone="muted"
            size="body"
            placeholder="Event name…"
          />
        </div>

        <!-- Event type picker -->
        <EventModalTypePicker
          :event-type="form.event_type"
          :color="typeColor"
          @update:event-type="form.event_type = $event"
          @close="close"
        />

        <!-- Date picker -->
        <EventModalDatePicker
          :date-type="form.date_type"
          :harptos-year="form.harptos_year"
          :harptos-month="form.harptos_month"
          :harptos-day="form.harptos_day"
          :festival-day="form.festival_day"
          :is-multi-day="form.is_multi_day"
          :end-year="form.end_year"
          :end-month="form.end_month"
          :end-day="form.end_day"
          :months="adapter.months"
          :available-festivals="availableFestivals"
          @update:date-type="setDateType"
          @update:harptos-year="form.harptos_year = $event"
          @update:harptos-month="form.harptos_month = $event"
          @update:harptos-day="form.harptos_day = $event"
          @update:festival-day="form.festival_day = $event"
          @update:is-multi-day="form.is_multi_day = $event"
          @update:end-year="form.end_year = $event"
          @update:end-month="form.end_month = $event"
          @update:end-day="form.end_day = $event"
        />

        <!-- Description -->
        <div>
          <div class="mb-1 flex items-center justify-between gap-2">
            <label class="block text-label-lg font-semibold text-muted-foreground">
              DESCRIPTION
              <span class="text-muted-foreground font-fell normal-case tracking-normal">(optional)</span>
            </label>
            <AppButton
              v-if="campaign.isAiEnabled"
              type="button"
              variant="link"
              size="inline"
              :icon="IconGenerate"
              label="Draft with AI"
              :aria-expanded="aiOpen"
              @click="aiOpen = !aiOpen"
            />
          </div>
          <EventModalAiDraft
            v-if="aiOpen && campaign.isAiEnabled"
            class="mb-2"
            :date-label="dateLabel"
            :event-type="form.event_type"
            @draft="applyDraft"
            @close="aiOpen = false"
          />
          <RichTextEditor
            v-model="form.description"
            placeholder="What happened…"
            size="md"
          />
        </div>

        <!-- Travel fields: location + party members -->
        <template v-if="form.event_type === 'travel'">
          <EventModalTravelFields
            :linked-location-id="linkedLocationId"
            :travel-party-member-ids="form.travel_party_member_ids"
            :locations="locations ?? []"
            :party="party ?? []"
            @update:linked-location-id="linkedLocationId = $event"
            @update:travel-party-member-ids="form.travel_party_member_ids = $event"
          />
        </template>

        <!-- Entity link (read-only when editing a non-travel pinned event) -->
        <div v-if="entityRoute && form.event_type !== 'travel'" class="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
          <component :is="entityIconComponent" class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span class="text-body text-muted-foreground flex-1 capitalize">
            Pinned {{ editEvent?.event_type }}
          </span>
          <AppButton
            :to="entityRoute"
            variant="link"
            size="inline"
            label="Open →"
            @click="close"
          />
        </div>

        <!-- Player visibility toggle -->
        <AppCheckbox
          v-model="form.player_visible"
          label="Visible to players"
          class="gap-2.5 select-none"
        />
      </div>

      <DraftConflictNotice
        :fields="conflictLabels"
        :on-discard="reset"
        class="mx-5 mb-2"
      />

      <!-- Actions -->
      <div class="shrink-0 flex items-center justify-between gap-2 px-5 py-3">
        <AppButton
          v-if="editEvent"
          variant="destructive"
          size="md"
          :label="isDeleting ? 'Deleting…' : 'Delete'"
          :disabled="isPending || isDeleting"
          @click="deleteAndClose"
        />
        <div v-else />
        <div class="flex gap-2">
          <AppButton variant="subtle" size="md" label="Cancel" @click="close" />
          <AppButton
            type="submit"
            variant="primary"
            size="md"
            :label="isPending ? 'Saving…' : editEvent ? 'Save Changes' : 'Create Event'"
            :disabled="isPending"
          />
        </div>
      </div>
    </form>
  </AppModal>
</template>

<script setup lang="ts">
import { watch, computed, ref, useId } from "vue";
import { IconClose, IconGenerate, IconEncounter, IconLocation, IconQuest } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import { useNote } from "@/composables/notes/useNotes";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { useRecordDraft } from "@/composables/useRecordDraft";
import { useCalendarStore } from "@/stores/calendar";
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from "@/composables/calendar/useCalendarEvents";
import { linkedEntityType, linkedEntityId, EVENT_TYPE_COLORS, eventColor } from "@/types/calendar.types";
import type {
  CalendarEvent,
  CalendarEventInsert,
} from "@/types/calendar.types";
import { useCampaignStore } from "@/stores/campaign";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useParty, useUpdatePartyMember } from "@/composables/party/useParty";
import EventModalTypePicker from "./EventModalTypePicker.vue";
import EventModalDatePicker from "./EventModalDatePicker.vue";
import EventModalTravelFields from "./EventModalTravelFields.vue";
import EventModalAiDraft from "./EventModalAiDraft.vue";
import { deepEqual } from "@/lib/utils";
import { markEdited } from "@/ai/provenance";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { formatEventDateLabel } from "@/lib/calendar/eventGeneration";
import type { CalendarEventDraft } from "@/ai/useCalendarEventGeneration";

const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  editEvent?: CalendarEvent | null;
  initialDay?: number | null;
}>();

const calendar = useCalendarStore();
const { mutateAsync: createEvent, isPending: isCreating } =
  useCreateCalendarEvent();
const { mutateAsync: updateEvent, isPending: isUpdating } =
  useUpdateCalendarEvent();
const { mutateAsync: deleteEvent, isPending: isDeleting } =
  useDeleteCalendarEvent();
const { mutateAsync: updatePartyMember } = useUpdatePartyMember();
const campaign = useCampaignStore();
const { data: locations } = useAllLocations();
const { data: party } = useParty();

const linkedLocationId = computed({
  get: () => form.linked_location_id ?? "",
  set: (v: string) => { form.linked_location_id = v || null; },
});

const isPending = computed(() => isCreating.value || isUpdating.value || isDeleting.value);

// ── Session note read-only view ───────────────────────────────────────────────
const isSessionNote = computed(() =>
  !!props.editEvent?.linked_note_id && props.editEvent.event_type === "session",
);
const linkedNoteId = computed(() => props.editEvent?.linked_note_id ?? "");
const { data: linkedNote, isLoading: linkedNoteLoading } = useNote(linkedNoteId);

const headingId = useId();

type DateType = "regular" | "festival";

/**
 * The form state. The regular/festival toggle lives in the draft (rather than
 * beside it) so the row builder below can read it from its argument, and the
 * colour is not here at all: it is derived from the type (`eventColor`).
 */
type EventDraft = Omit<CalendarEventInsert, "campaign_id" | "color"> & {
  date_type: DateType;
};

function toDraft(row: CalendarEvent | null): EventDraft {
  if (!row) {
    return {
      title: "",
      description: null,
      event_type: "campaign",
      date_type: "regular",
      harptos_year: calendar.currentYear,
      harptos_month: calendar.currentMonth,
      harptos_day: props.initialDay ?? 1,
      festival_day: null,
      is_multi_day: false,
      end_year: null,
      end_month: null,
      end_day: null,
      linked_quest_id: null,
      linked_encounter_id: null,
      linked_location_id: null,
      linked_note_id: null,
      travel_party_member_ids: [],
      player_visible: false,
      ai_provenance: null,
    };
  }
  return {
    title: row.title,
    description: row.description,
    event_type: row.event_type,
    date_type: row.festival_day ? "festival" : "regular",
    harptos_year: row.harptos_year,
    harptos_month: row.harptos_month,
    harptos_day: row.harptos_day,
    festival_day: row.festival_day,
    is_multi_day: row.is_multi_day,
    end_year: row.end_year,
    end_month: row.end_month,
    end_day: row.end_day,
    linked_quest_id: row.linked_quest_id,
    linked_encounter_id: row.linked_encounter_id,
    linked_location_id: row.linked_location_id,
    linked_note_id: row.linked_note_id,
    travel_party_member_ids: row.travel_party_member_ids ?? [],
    player_visible: row.player_visible ?? false,
    ai_provenance: row.ai_provenance ?? null,
  };
}

/** The columns a draft saves. Pure: `changes()` also runs it over the server copy. */
function buildRow(d: EventDraft): Omit<CalendarEventInsert, "campaign_id"> {
  const { date_type, ...rest } = d;
  return {
    ...rest,
    color: eventColor(d),
    harptos_month: date_type === "regular" ? d.harptos_month : null,
    harptos_day: date_type === "regular" ? d.harptos_day : null,
    festival_day: date_type === "festival" ? d.festival_day : null,
    end_year: d.is_multi_day ? d.end_year : null,
    end_month: d.is_multi_day ? d.end_month : null,
    end_day: d.is_multi_day ? d.end_day : null,
  };
}

const { draft: form, conflicts, changes, commit, reset } = useRecordDraft({
  source: () => props.editEvent,
  identity: (row) => row.id,
  toDraft,
});

const CONFLICT_LABELS: Partial<Record<keyof EventDraft, string>> = {
  title: "Title",
  description: "Description",
  event_type: "Type",
  date_type: "Date",
  harptos_year: "Date",
  harptos_month: "Date",
  harptos_day: "Date",
  festival_day: "Date",
  is_multi_day: "Date",
  end_year: "Date",
  end_month: "Date",
  end_day: "Date",
  linked_location_id: "Location",
  travel_party_member_ids: "Travelling party",
  player_visible: "Visible to players",
};
const conflictLabels = computed(() => [
  ...new Set(conflicts.value.flatMap((key) => CONFLICT_LABELS[key] ?? [])),
]);

const typeColor = computed(() => eventColor(form));

const adapter = computed(() => calendar.adapter);

const availableFestivals = computed(() =>
  adapter.value.intercalaryDays.filter(
    (d) => !d.isLeapOnly || adapter.value.isLeapYear(form.harptos_year),
  ),
);

// The dialog stays mounted while shut. Editing starts from the server copy
// (dropping edits abandoned last time); creating starts from a blank form.
watch(open, (isOpen) => {
  if (!isOpen) return;
  aiOpen.value = false;
  generated = null;
  if (props.editEvent) reset();
  else Object.assign(form, toDraft(null));
});

// ── Draft with AI ─────────────────────────────────────────────────────────────
const aiOpen = ref(false);
/** What the model last wrote, so a save can tell whether the DM changed it. */
let generated: { title: string; description: string | null } | null = null;

const dateLabel = computed(() =>
  formatEventDateLabel({
    year: form.harptos_year,
    month: form.date_type === "regular" ? form.harptos_month : null,
    day: form.date_type === "regular" ? form.harptos_day : null,
    festivalDay: form.date_type === "festival" ? form.festival_day : null,
    monthName:
      form.harptos_month !== null
        ? (adapter.value.months.find((m) => m.num === form.harptos_month)?.name ?? null)
        : null,
  }),
);

function applyDraft(result: CalendarEventDraft) {
  // Only an empty title is filled, and the type only moves off the untouched
  // default: a DM's own choices are never overwritten by a draft.
  if (!form.title.trim()) form.title = result.title;
  if (form.event_type === "campaign" && result.event_type !== "campaign") {
    form.event_type = result.event_type as CalendarEvent["event_type"];
  }
  form.description = toTiptapJson(result.description);
  form.ai_provenance = result.ai_provenance;
  generated = { title: form.title, description: form.description };
  aiOpen.value = false;
}

/** Content the DM can edit; moving the date or visibility is not a material edit. */
function contentChangedSince(base: { title: string; description: string | null }): boolean {
  return form.title.trim() !== base.title.trim() || !deepEqual(form.description, base.description);
}

// An event handler rather than a watcher: a watcher would also fire when the
// draft is seeded or merged from the server, and overwrite the saved date.
function setDateType(type: DateType) {
  form.date_type = type;
  if (type === "festival") {
    form.harptos_month = null;
    form.harptos_day = null;
    form.festival_day = availableFestivals.value[0]?.name ?? null;
  } else {
    form.festival_day = null;
    form.harptos_month = calendar.currentMonth;
    form.harptos_day = 1;
  }
}

const ENTITY_ROUTES: Record<string, string> = {
  quest: "/quests",
  encounter: "/encounters",
  location: "/locations",
};

const entityRoute = computed(() => {
  if (!props.editEvent) return null;
  const type = linkedEntityType(props.editEvent);
  const id = linkedEntityId(props.editEvent);
  if (!type || !id) return null;
  return `${ENTITY_ROUTES[type]}/${id}`;
});

const entityIconComponent = computed(() => {
  if (!props.editEvent) return null;
  const type = linkedEntityType(props.editEvent);
  if (type === "quest") return IconQuest;
  if (type === "encounter") return IconEncounter;
  if (type === "location") return IconLocation;
  return null;
});

function close() {
  open.value = false;
}

async function deleteAndClose() {
  await deleteEvent(props.editEvent!.id);
  close();
}

async function submit() {
  const base = generated ?? props.editEvent;
  if (form.ai_provenance && base && contentChangedSince(base)) {
    form.ai_provenance = markEdited(form.ai_provenance);
  }
  const payload = buildRow(form);

  const justSharedToPlayers =
    payload.player_visible && !(props.editEvent?.player_visible ?? false);

  if (props.editEvent) {
    // Only the columns the user changed: a stale form never rewrites the rest.
    // campaign_id is never part of an update.
    const update = changes(buildRow);
    if (Object.keys(update).length > 0) {
      await updateEvent({ id: props.editEvent.id, update });
    }
    commit();
  } else {
    await createEvent({ ...payload, campaign_id: campaign.activeCampaignId });
  }

  if (justSharedToPlayers && campaign.activeCampaignId) {
    void sendCampaignAnnouncement(
      campaign.activeCampaignId,
      `📅 Calendar event shared: "${payload.title}"`,
    );
  }

  if (payload.event_type === "travel" && payload.travel_party_member_ids.length) {
    await Promise.allSettled(
      payload.travel_party_member_ids.map((memberId) =>
        updatePartyMember({
          id: memberId,
          update: { current_location_id: payload.linked_location_id },
        }),
      ),
    );
  }

  close();
}
</script>
