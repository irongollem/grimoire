<template>
  <div class="flex flex-col gap-4">
    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Note title</span>
        <input
          v-model="title"
          placeholder="Note title…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <!-- Category -->
      <select
        v-model="category"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">
          {{ c.label }}
        </option>
      </select>

      <!-- Session # — only relevant for session notes -->
      <label v-if="category === 'session'" class="flex items-center gap-1.5">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">#</span>
        <input
          v-model.number="sessionNum"
          type="number"
          min="1"
          placeholder="Session"
          class="w-20 bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <!-- IconPin toggle -->
      <button
        type="button"
        :title="isPinned ? 'Unpin note' : 'IconPin note'"
        class="p-2 rounded-md border border-border transition-colors"
        :class="isPinned ? 'bg-primary/10 text-primary border-primary/30' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="isPinned = !isPinned"
      >
        <IconPin class="h-3.5 w-3.5" />
      </button>

      <!-- Player visibility toggle -->
      <PlayerVisibilityToggle
        :visible-to="playerVisibleTo"
        @update:visible-to="playerVisibleTo = $event"
      />

      <button
        type="button"
        :disabled="saving || !title.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <IconSave class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : props.note ? "Save" : "Create" }}
      </button>

      <button
        v-if="props.note"
        type="button"
        :disabled="deleting"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        @click="remove"
      >
        <IconDelete class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <!-- Tags -->
    <TagInput v-model="tags" />

    <!-- ── Session date fields ──────────────────────────────────────────────── -->
    <template v-if="category === 'session'">
      <div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">SESSION DATES</p>

        <!-- Start date -->
        <div class="space-y-1.5">
          <p class="font-fell text-xs text-muted-foreground">Start date (in-game)</p>
          <div class="flex gap-2 flex-wrap">
            <input
              v-model.number="sessionStartYear"
              type="number"
              min="1"
              placeholder="Year"
              class="w-24 bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <select
              v-model.number="sessionStartMonth"
              class="bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option :value="null">— Month —</option>
              <option v-for="m in calendarAdapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
            </select>
            <input
              v-model.number="sessionStartDay"
              type="number"
              min="1"
              max="30"
              placeholder="Day"
              class="w-20 bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <!-- End date -->
        <div class="space-y-1.5">
          <p class="font-fell text-xs text-muted-foreground">End date (in-game, optional)</p>
          <div class="flex gap-2 flex-wrap">
            <input
              v-model.number="sessionEndYear"
              type="number"
              min="1"
              placeholder="Year"
              class="w-24 bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <select
              v-model.number="sessionEndMonth"
              class="bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option :value="null">— Month —</option>
              <option v-for="m in calendarAdapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
            </select>
            <input
              v-model.number="sessionEndDay"
              type="number"
              min="1"
              max="30"
              placeholder="Day"
              class="w-20 bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <!-- Real-world date -->
        <div class="space-y-1.5">
          <p class="font-fell text-xs text-muted-foreground">Real-world date (optional)</p>
          <VueDatePicker
            v-model="sessionRealDate"
            :dark="true"
            :enable-time-picker="false"
            :teleport="true"
            model-type="yyyy-MM-dd"
            format="yyyy-MM-dd"
            placeholder="Pick real-world date…"
            class="grimoire-datepicker"
          />
        </div>

        <!-- Linked calendar event indicator -->
        <div v-if="props.note?.linked_calendar_event_id" class="flex items-center gap-2 font-cinzel text-xs text-primary">
          <IconCalendarDays class="h-3 w-3" />
          Calendar event linked
        </div>
      </div>
    </template>

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Tiptap editor -->
    <RichTextEditor
      ref="rteRef"
      v-model="body"
      placeholder="Write your note here…"
      allow-upload
      allow-calendar-events
      :entity-mention-items="entityMentionItems"
      :ai-context="`${category} note${title ? ` — ${title}` : ''}`"
      @insert-calendar-event="showEventModal = true"
      @illustration-click="onIllustrationClick"
    >
      <template v-if="isOpenAiImageProvider || hasTextProvider" #toolbar-end>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button
          v-if="hasTextProvider"
          type="button"
          title="Write Chronicle"
          class="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          @click="openChroniclerWrite"
        >
          <IconNote class="h-3.5 w-3.5" />
        </button>
        <template v-if="isOpenAiImageProvider">
          <button
            type="button"
            title="Generate scene illustration"
            class="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            @click="openChroniclerGenerate"
          >
            <IconGenerate class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Scene library"
            class="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            @click="showChroniclerLibrary = true"
          >
            <IconImages class="h-3.5 w-3.5" />
          </button>
        </template>
      </template>
    </RichTextEditor>
  </div>

  <!-- Inline calendar event creation modal -->
  <InlineCalendarEventModal
    v-model="showEventModal"
    @event-created="onEventCreated"
  />

  <ChroniclerGenerateDialog
    :visible="showChroniclerGenerate"
    :initial-prompt="illustrationPrompt"
    @close="showChroniclerGenerate = false; illustrationPrompt = ''"
    @generated="onChroniclerGenerated"
  />

  <ChroniclerWriteDialog
    :visible="showChroniclerWrite"
    @close="showChroniclerWrite = false"
    @insert="onChroniclerWrite"
  />

  <ChroniclerLibraryPicker
    :visible="showChroniclerLibrary"
    @close="showChroniclerLibrary = false"
    @select="onChroniclerSelect"
  />

  <PaywallModal v-model="showPaywall" resource="notes" />
  <PaywallModal v-model="showAiPaywall" message="AI scene illustration is a Pro feature. Upgrade to generate artwork from your session notes." />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import RichTextEditor from "../common/RichTextEditor.vue";
import InlineCalendarEventModal from "@/components/calendar/InlineCalendarEventModal.vue";
import ChroniclerGenerateDialog from "./ChroniclerGenerateDialog.vue";
import ChroniclerLibraryPicker from "./ChroniclerLibraryPicker.vue";
import ChroniclerWriteDialog from "./ChroniclerWriteDialog.vue";
import { IconCalendarDays, IconDelete, IconGenerate, IconImages, IconNote, IconPin, IconSave } from '@/lib/icons';
import TagInput from "@/components/common/TagInput.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";
import {
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useNotes,
} from "@/composables/useNotes";
import { useEntityMentionItems } from "@/composables/useEntityMentionItems";
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from "@/composables/useCalendarEvents";
import {
  removeRichTextImages,
  cleanupRemovedRichTextImages,
} from "@/composables/useImageUpload";
import type { Note, NoteCategory } from "@/types/notes.types";
import type { CalendarEvent } from "@/types/calendar.types";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarStore } from "@/stores/calendar";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import { getCurrentUser } from "@/lib/supabase";
import { storeToRefs } from "pinia";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useSubscription } from "@/composables/useSubscription";

const CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "session", label: "Session" },
  { value: "lore", label: "Lore" },
  { value: "location", label: "Location" },
  { value: "quest", label: "Quest" },
  { value: "faction", label: "Faction" },
];

const props = defineProps<{ note: Note | null }>();
const router = useRouter();

const title = ref(props.note?.title ?? "");
const body = ref<string | null>(props.note?.content ?? null);
const category = ref<NoteCategory>(props.note?.category ?? "general");
const sessionNum = ref<number | null>(props.note?.session_num ?? null);
const isPinned = ref(props.note?.is_pinned ?? false);
const playerVisibleTo = ref<string[]>(props.note?.player_visible_to ?? []);
const tags = ref<string[]>(props.note?.tags ? [...props.note.tags] : []);
const saving = ref(false);
const deleting = ref(false);
const showPaywall = ref(false);
const saveError = ref("");
const user = getCurrentUser();

// ── Session dates ─────────────────────────────────────────────────────────────
const sessionStartYear  = ref<number | null>(props.note?.session_start_year ?? null);
const sessionStartMonth = ref<number | null>(props.note?.session_start_month ?? null);
const sessionStartDay   = ref<number | null>(props.note?.session_start_day ?? null);
const sessionEndYear    = ref<number | null>(props.note?.session_end_year ?? null);
const sessionEndMonth   = ref<number | null>(props.note?.session_end_month ?? null);
const sessionEndDay     = ref<number | null>(props.note?.session_end_day ?? null);
const sessionRealDate   = ref<string | null>(props.note?.session_real_date ?? null);

const calendarStore = useCalendarStore();
const calendarAdapter = computed(() => calendarStore.adapter);

const { data: allNotes } = useNotes();
const { mentionItems: entityMentionItems } = useEntityMentionItems();

// ── Pre-fill start date from the last session note's end date ─────────────────
// Only applies when creating a new session note (props.note === null).
watch(
  category,
  (newCat) => {
    if (props.note !== null) return; // editing — don't overwrite
    if (newCat !== "session") return;
    if (sessionStartYear.value !== null) return; // already set

    const sessionNotes = (allNotes.value ?? []).filter(
      (n) => n.category === "session" && n.session_num !== null,
    );
    if (!sessionNotes.length) return;

    const last = sessionNotes.reduce((a, b) =>
      (a.session_num ?? 0) > (b.session_num ?? 0) ? a : b,
    );

    // Use end date if set, otherwise fall back to start date
    const prefillYear  = last.session_end_year  ?? last.session_start_year;
    const prefillMonth = last.session_end_month ?? last.session_start_month;
    const prefillDay   = last.session_end_day   ?? last.session_start_day;

    if (prefillYear !== null) {
      sessionStartYear.value  = prefillYear;
      sessionStartMonth.value = prefillMonth;
      sessionStartDay.value   = prefillDay;
    }
  },
  { immediate: true },
);

// ── Chronicler ────────────────────────────────────────────────────────────────
const showChroniclerGenerate = ref(false);
const showChroniclerLibrary  = ref(false);
const showChroniclerWrite    = ref(false);
const showAiPaywall          = ref(false);

const campaignStore = useCampaignStore();
const isOpenAiImageProvider = computed(
  () => (campaignStore.activeCampaign?.image_provider ?? "openai") === "openai",
);
// Text generation works on both BYOK and platform keys via the edge function,
// so the toolbar button only needs a campaign + configured provider — not a
// decrypted client-side key.
const hasTextProvider = computed(() => !!(campaignStore.activeCampaign?.text_provider ?? "openai"));

const { isPro } = useSubscription();

function openChroniclerGenerate() {
  if (!isPro.value) {
    showAiPaywall.value = true;
    return;
  }
  showChroniclerGenerate.value = true;
}

function openChroniclerWrite() {
  if (!isPro.value) {
    showAiPaywall.value = true;
    return;
  }
  showChroniclerWrite.value = true;
}

function onChroniclerGenerated(url: string) {
  rteRef.value?.insertImageAtCursor(url);
}

function onChroniclerSelect(url: string) {
  rteRef.value?.insertImageAtCursor(url);
}

function onChroniclerWrite(rawMarkdown: string) {
  rteRef.value?.insertChronicleContent(rawMarkdown);
}

const illustrationPrompt = ref("");

function onIllustrationClick(prompt: string) {
  if (!isPro.value) { showAiPaywall.value = true; return; }
  illustrationPrompt.value = prompt;
  showChroniclerGenerate.value = true;
}

// ── Inline event modal ────────────────────────────────────────────────────────
const showEventModal = ref(false);
const rteRef = ref<InstanceType<typeof RichTextEditor> | null>(null);

function onEventCreated(event: CalendarEvent) {
  rteRef.value?.insertCalendarEventRef({
    eventId: event.id,
    label: event.title,
    year: event.harptos_year,
    month: event.harptos_month,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateNote();
const { mutateAsync: update } = useUpdateNote();
const { mutateAsync: del } = useDeleteNote();
const { mutateAsync: createCalEvent } = useCreateCalendarEvent();
const { mutateAsync: updateCalEvent } = useUpdateCalendarEvent();
const { mutateAsync: deleteCalEvent } = useDeleteCalendarEvent();
const { activeCampaignId } = storeToRefs(useCampaignStore());

function buildPayload() {
  const isSession = category.value === "session";
  return {
    title: title.value.trim() || "Untitled Note",
    category: category.value,
    session_num: isSession ? (sessionNum.value ?? null) : null,
    is_pinned: isPinned.value,
    player_visible_to: playerVisibleTo.value,
    tags: tags.value,
    content: body.value ?? null,
    user_id: user?.id,
    session_start_year:  isSession ? (sessionStartYear.value ?? null) : null,
    session_start_month: isSession ? (sessionStartMonth.value ?? null) : null,
    session_start_day:   isSession ? (sessionStartDay.value ?? null) : null,
    session_end_year:    isSession ? (sessionEndYear.value ?? null) : null,
    session_end_month:   isSession ? (sessionEndMonth.value ?? null) : null,
    session_end_day:     isSession ? (sessionEndDay.value ?? null) : null,
    session_real_date:   isSession ? (sessionRealDate.value ?? null) : null,
    // Managed by syncSessionCalendarEvent — never set directly here
    linked_calendar_event_id: props.note?.linked_calendar_event_id ?? null,
  };
}

// ── Session calendar event sync ───────────────────────────────────────────────
// Avoids circular FK: insert note first → insert event with linked_note_id
// → patch note.linked_calendar_event_id.

async function syncSessionCalendarEvent(noteId: string) {
  const isSession = category.value === "session";
  const hasDate = isSession && sessionStartYear.value !== null;
  const existingEventId = props.note?.linked_calendar_event_id ?? null;

  if (hasDate) {
    const isMultiDay = sessionEndYear.value !== null;
    const eventPayload = {
      title: `Session ${sessionNum.value ?? "?"}: ${title.value.trim()}`,
      event_type: "session" as const,
      color: "#C9920A",
      harptos_year:  sessionStartYear.value!,
      harptos_month: sessionStartMonth.value,
      harptos_day:   sessionStartDay.value,
      festival_day:  null,
      is_multi_day:  isMultiDay,
      end_year:      isMultiDay ? sessionEndYear.value : null,
      end_month:     isMultiDay ? sessionEndMonth.value : null,
      end_day:       isMultiDay ? sessionEndDay.value : null,
      description:   null,
      linked_quest_id: null,
      linked_encounter_id: null,
      linked_location_id: null,
      linked_note_id: noteId,
      travel_party_member_ids: [],
      player_visible: false,
      campaign_id: activeCampaignId.value,
    };

    if (existingEventId) {
      await updateCalEvent({ id: existingEventId, update: eventPayload });
    } else {
      const newEvt = await createCalEvent(eventPayload);
      await update({ id: noteId, update: { linked_calendar_event_id: newEvt.id } });
    }
  } else if (existingEventId) {
    await deleteCalEvent(existingEventId);
    await update({ id: noteId, update: { linked_calendar_event_id: null } });
  }
}

async function save() {
  if (!title.value.trim() && !body.value) return;
  saving.value = true;
  saveError.value = "";
  const wasShared = (props.note?.player_visible_to?.length ?? 0) > 0;
  const nowShared = playerVisibleTo.value.length > 0;
  const justShared = nowShared && !wasShared;
  try {
    if (props.note) {
      const oldContent = props.note.content;
      await update({ id: props.note.id, update: buildPayload() });
      cleanupRemovedRichTextImages(oldContent, body.value);
      await syncSessionCalendarEvent(props.note.id);
      if (justShared && activeCampaignId.value)
        void sendCampaignAnnouncement(
          activeCampaignId.value,
          `📜 Note shared: "${title.value.trim()}"`,
          { entity_type: "note", entity_id: props.note.id },
        );
      router.push("/notes");
    } else {
      const created = await create(buildPayload());
      await syncSessionCalendarEvent(created.id);
      if (nowShared && activeCampaignId.value)
        void sendCampaignAnnouncement(
          activeCampaignId.value,
          `📜 Note shared: "${created.title}"`,
          { entity_type: "note", entity_id: created.id },
        );
      router.replace(`/notes/${created.id}`);
    }
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.note) return;
  if (deleting.value) return;
  if (!(await confirm(`Delete "${props.note.title}"? This cannot be undone.`)))
    return;
  deleting.value = true;
  try {
    const oldContent = props.note.content;
    if (props.note.linked_calendar_event_id)
      await deleteCalEvent(props.note.linked_calendar_event_id);
    await del(props.note.id);
    removeRichTextImages(oldContent);
    router.push("/notes");
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

.note-editor :deep(.ProseMirror) {
  @apply font-fell text-sm text-foreground outline-none min-h-96;
}
.note-editor :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed;
}
.note-editor :deep(.ProseMirror h1) {
  @apply font-cinzel text-2xl font-bold mb-3 mt-5 first:mt-0;
}
.note-editor :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mb-2 mt-4 first:mt-0;
}
.note-editor :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-bold mb-2 mt-3 first:mt-0;
}
.note-editor :deep(.ProseMirror ul) {
  @apply list-disc pl-5 mb-3 space-y-1;
}
.note-editor :deep(.ProseMirror ol) {
  @apply list-decimal pl-5 mb-3 space-y-1;
}
.note-editor :deep(.ProseMirror blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
.note-editor :deep(.ProseMirror hr) {
  @apply border-t border-primary/30 my-4;
}
.note-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground/50 italic pointer-events-none float-left h-0;
}
</style>
