<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <div
        class="bg-card border border-border rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-border"
        >
          <div class="flex items-center gap-2">
            <div class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: editEvent ? eventColor(editEvent) : EVENT_TYPE_COLORS['campaign'] }" />
            <h2 class="text-heading font-bold text-foreground">
              {{ isSessionNote ? (linkedNote?.title ?? 'Session Note') : (editEvent ? "Edit Event" : "New Event") }}
            </h2>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- Session note read-only view -->
        <div v-if="isSessionNote" class="px-5 py-4 space-y-4">
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
          <!-- Footer -->
          <div class="flex items-center justify-between pt-2 border-t border-border">
            <button type="button" class="px-4 py-2 text-label-lg font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors" @click="close">
              Close
            </button>
            <RouterLink
              v-if="linkedNote"
              :to="`/notes/${linkedNote.id}`"
              class="px-4 py-2 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
              @click="close"
            >
              Open in Notes →
            </RouterLink>
          </div>
        </div>

        <!-- Form -->
        <form v-else class="px-5 py-4 space-y-4" @submit.prevent="submit">
          <!-- Title -->
          <div>
            <label
              class="block text-label-lg font-semibold text-muted-foreground mb-1"
            >
              TITLE
            </label>
            <input
              v-model="form.title"
              required
              type="text"
              placeholder="Event name…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <!-- Event type picker -->
          <EventModalTypePicker
            :event-type="form.event_type"
            :color="form.color"
            @update:event-type="form.event_type = $event"
            @close="close"
          />

          <!-- Date picker -->
          <EventModalDatePicker
            :date-type="dateType"
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
            @update:date-type="dateType = $event"
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
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">
              DESCRIPTION
              <span class="text-muted-foreground font-fell normal-case tracking-normal">(optional)</span>
            </label>
            <RichTextEditor
              v-model="form.description"
              placeholder="What happened…"
              min-height="120px"
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
            <RouterLink
              :to="entityRoute"
              class="font-cinzel text-xs text-primary hover:opacity-80 transition-opacity"
              @click="close"
            >
              Open →
            </RouterLink>
          </div>

          <!-- Player visibility toggle -->
          <label class="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              v-model="form.player_visible"
              type="checkbox"
              class="rounded border-border w-4 h-4 accent-primary"
            />
            <span class="text-body text-foreground">Visible to players</span>
          </label>

          <!-- Actions -->
          <div class="flex items-center justify-between gap-2 pt-1">
            <button
              v-if="editEvent"
              type="button"
              :disabled="isPending || isDeleting"
              class="px-4 py-2 text-label-lg font-semibold text-destructive hover:opacity-80 border border-destructive/40 rounded-md transition-opacity disabled:opacity-50"
              @click="deleteAndClose"
            >
              {{ isDeleting ? "Deleting…" : "Delete" }}
            </button>
            <div v-else />
            <div class="flex gap-2">
              <button
                type="button"
                class="px-4 py-2 text-label-lg font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
                @click="close"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="isPending"
                class="px-4 py-2 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {{
                  isPending
                    ? "Saving…"
                    : editEvent
                      ? "Save Changes"
                      : "Create Event"
                }}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { RouterLink } from "vue-router";
import { IconEncounter, IconLocation, IconQuest } from '@/lib/icons';
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import { useNote } from "@/composables/useNotes";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import { useCalendarStore } from "@/stores/calendar";
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from "@/composables/useCalendarEvents";
import { linkedEntityType, linkedEntityId, EVENT_TYPE_COLORS, eventColor } from "@/types/calendar.types";
import type {
  CalendarEvent,
  CalendarEventInsert,
} from "@/types/calendar.types";
import { useCampaignStore } from "@/stores/campaign";
import { useAllLocations } from "@/composables/useLocations";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import EventModalTypePicker from "./EventModalTypePicker.vue";
import EventModalDatePicker from "./EventModalDatePicker.vue";
import EventModalTravelFields from "./EventModalTravelFields.vue";

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
  get: () => form.value.linked_location_id ?? "",
  set: (v: string) => { form.value.linked_location_id = v || null; },
});

const isPending = computed(() => isCreating.value || isUpdating.value || isDeleting.value);

// ── Session note read-only view ───────────────────────────────────────────────
const isSessionNote = computed(() =>
  !!props.editEvent?.linked_note_id && props.editEvent.event_type === "session",
);
const linkedNoteId = computed(() => props.editEvent?.linked_note_id ?? "");
const { data: linkedNote, isLoading: linkedNoteLoading } = useNote(linkedNoteId);

type DateType = "regular" | "festival";
const dateType = ref<DateType>("regular");

function defaultForm(): CalendarEventInsert {
  return {
    campaign_id: campaign.activeCampaignId,
    title: "",
    description: null,
    event_type: "campaign",
    color: EVENT_TYPE_COLORS["campaign"],
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
  };
}

const form = ref<CalendarEventInsert>(defaultForm());

const adapter = computed(() => calendar.adapter);

const availableFestivals = computed(() =>
  adapter.value.intercalaryDays.filter(
    (d) => !d.isLeapOnly || adapter.value.isLeapYear(form.value.harptos_year),
  ),
);

watch(open, (isOpen) => {
  if (isOpen) {
    if (props.editEvent) {
      form.value = {
        campaign_id: campaign.activeCampaignId,
        title: props.editEvent.title,
        description: props.editEvent.description,
        event_type: props.editEvent.event_type,
        color: eventColor(props.editEvent),
        harptos_year: props.editEvent.harptos_year,
        harptos_month: props.editEvent.harptos_month,
        harptos_day: props.editEvent.harptos_day,
        festival_day: props.editEvent.festival_day,
        is_multi_day: props.editEvent.is_multi_day,
        end_year: props.editEvent.end_year,
        end_month: props.editEvent.end_month,
        end_day: props.editEvent.end_day,
        linked_quest_id: props.editEvent.linked_quest_id,
        linked_encounter_id: props.editEvent.linked_encounter_id,
        linked_location_id: props.editEvent.linked_location_id,
        linked_note_id: props.editEvent.linked_note_id,
        travel_party_member_ids: props.editEvent.travel_party_member_ids ?? [],
        player_visible: props.editEvent.player_visible ?? false,
      };
      dateType.value = props.editEvent.festival_day ? "festival" : "regular";
    } else {
      form.value = defaultForm();
      dateType.value = "regular";
    }
  }
});

watch(dateType, (type) => {
  if (type === "festival") {
    form.value.harptos_month = null;
    form.value.harptos_day = null;
    form.value.festival_day = availableFestivals.value[0]?.name ?? null;
  } else {
    form.value.festival_day = null;
    form.value.harptos_month = calendar.currentMonth;
    form.value.harptos_day = 1;
  }
});

watch(
  () => form.value.event_type,
  (newType) => { form.value.color = eventColor({ event_type: newType }); },
);

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
  const payload: CalendarEventInsert = {
    ...form.value,
    harptos_month:
      dateType.value === "regular" ? form.value.harptos_month : null,
    harptos_day: dateType.value === "regular" ? form.value.harptos_day : null,
    festival_day:
      dateType.value === "festival" ? form.value.festival_day : null,
    end_year: form.value.is_multi_day ? form.value.end_year : null,
    end_month: form.value.is_multi_day ? form.value.end_month : null,
    end_day: form.value.is_multi_day ? form.value.end_day : null,
  };

  const justSharedToPlayers =
    payload.player_visible && !(props.editEvent?.player_visible ?? false);

  if (props.editEvent) {
    // Exclude campaign_id: never overwrite it on update.
    const { campaign_id: _cid, ...updatePayload } = payload;
    await updateEvent({ id: props.editEvent.id, update: updatePayload });
  } else {
    await createEvent(payload);
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
