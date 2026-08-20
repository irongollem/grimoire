<template>
  <div class="flex flex-col gap-4">
    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Note title</span>
        <AppInput
          v-model="title"
          tone="card"
          size="heading"
          placeholder="Note title…"
        />
      </label>

      <!-- Category -->
      <AppSelect v-model="category" size="md">
        <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">
          {{ c.label }}
        </option>
      </AppSelect>

      <!-- Session # — only relevant for session notes -->
      <label v-if="category === 'session'" class="flex items-center gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">#</span>
        <AppInput
          v-model.number="sessionNum"
          type="number"
          min="1"
          placeholder="Session"
          tone="card"
          size="md"
          class="w-20"
        />
      </label>

      <!-- Pin toggle -->
      <AppButton
        variant="subtle"
        size="icon-sm"
        :active="isPinned"
        :icon="IconPin"
        :class="isPinned ? '' : 'bg-card'"
        :tooltip="isPinned ? 'Unpin note' : 'Pin note'"
        @click="isPinned = !isPinned"
      />

      <!-- Reveal to players -->
      <AudienceRevealControl
        :name="title"
        :visible-to="playerVisibleTo"
        @change="playerVisibleTo = $event"
      />

      <AppButton
        :disabled="saving || !title.trim()"
        variant="primary"
        size="md"
        :icon="IconSave"
        :label="saving ? 'Saving…' : props.note ? 'Save' : 'Create'"
        @click="save"
      />

      <AppButton
        v-if="props.note"
        :disabled="deleting"
        variant="destructive"
        size="md"
        :icon="IconDelete"
        label="Delete"
        @click="remove"
      />
    </div>

    <!-- Tags -->
    <TagInput v-model="tags" />

    <!-- ── Session date fields ──────────────────────────────────────────────── -->
    <template v-if="category === 'session'">
      <div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <p class="text-label-lg font-semibold text-muted-foreground">SESSION DATES</p>

        <!-- Start date -->
        <div class="space-y-1.5">
          <p class="text-caption text-muted-foreground">Start date (in-game)</p>
          <div class="flex gap-2 flex-wrap">
            <AppInput
              v-model.number="sessionStartYear"
              type="number"
              min="1"
              placeholder="Year"
              tone="card"
              size="body-xs"
              class="w-24"
            />
            <AppSelect v-model.number="sessionStartMonth" size="body">
              <option :value="null">— Month —</option>
              <option v-for="m in calendarAdapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
            </AppSelect>
            <AppInput
              v-model.number="sessionStartDay"
              type="number"
              min="1"
              max="30"
              placeholder="Day"
              tone="card"
              size="body-xs"
              class="w-20"
            />
          </div>
        </div>

        <!-- End date -->
        <div class="space-y-1.5">
          <p class="text-caption text-muted-foreground">End date (in-game, optional)</p>
          <div class="flex gap-2 flex-wrap">
            <AppInput
              v-model.number="sessionEndYear"
              type="number"
              min="1"
              placeholder="Year"
              tone="card"
              size="body-xs"
              class="w-24"
            />
            <AppSelect v-model.number="sessionEndMonth" size="body">
              <option :value="null">— Month —</option>
              <option v-for="m in calendarAdapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
            </AppSelect>
            <AppInput
              v-model.number="sessionEndDay"
              type="number"
              min="1"
              max="30"
              placeholder="Day"
              tone="card"
              size="body-xs"
              class="w-20"
            />
          </div>
        </div>

        <!-- Real-world date -->
        <div class="space-y-1.5">
          <p class="text-caption text-muted-foreground">Real-world date (optional)</p>
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

    <p v-if="saveError" class="text-destructive text-body">
      {{ saveError }}
    </p>

    <!-- Tiptap editor -->
    <RichTextEditor
      ref="rteRef"
      v-model="body"
      size="lg"
      placeholder="Write your note here…"
      allow-upload
      allow-calendar-events
      :entity-mention-items="entityMentionItems"
      :ai-context="`${category} note${title ? ` — ${title}` : ''}`"
      @insert-calendar-event="showEventModal = true"
      @illustration-click="onIllustrationClick"
    >
      <template v-if="hasImageProvider || hasTextProvider" #toolbar-end>
        <div class="w-px h-5 bg-border mx-0.5" />
        <AppButton
          v-if="hasTextProvider"
          variant="ghost"
          size="icon-xs"
          :icon="IconNote"
          class="hover:bg-accent"
          tooltip="Write Chronicle"
          @click="openChroniclerWrite"
        />
        <template v-if="hasImageProvider">
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="IconGenerate"
            class="hover:bg-accent"
            tooltip="Generate scene illustration"
            @click="openChroniclerGenerate"
          />
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="IconImages"
            class="hover:bg-accent"
            tooltip="Scene library"
            @click="showChroniclerLibrary = true"
          />
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
    :note-id="props.note?.id"
    @close="showChroniclerGenerate = false; illustrationPrompt = ''"
    @started="onChroniclerStarted"
  />

  <ChroniclerWriteDialog
    :visible="showChroniclerWrite"
    :note-id="props.note?.id"
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
import "@/assets/vendor/datepicker.css";
import RichTextEditor from "../common/RichTextEditor.vue";
import InlineCalendarEventModal from "@/components/calendar/InlineCalendarEventModal.vue";
import ChroniclerGenerateDialog from "./ChroniclerGenerateDialog.vue";
import ChroniclerLibraryPicker from "./ChroniclerLibraryPicker.vue";
import ChroniclerWriteDialog from "./ChroniclerWriteDialog.vue";
import { IconCalendarDays, IconDelete, IconGenerate, IconImages, IconNote, IconPin, IconSave } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import TagInput from "@/components/common/TagInput.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
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
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarStore } from "@/stores/calendar";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import { notifyNoteShared } from "@/composables/useEmailNotify";
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
// Set when a Chronicle write is inserted (see onChroniclerWrite below);
// preserved across unrelated edits so re-saving a note doesn't erase a prior
// generation's record — never cleared back to null once populated (#606).
const aiProvenance = ref<AiProvenance | null>(props.note?.ai_provenance ?? null);
// Body content as of the last known AI-authored state: the loaded content, or
// (if the DM inserts a fresh Chronicle write this session) the body right
// after that insert. Accepting an AI draft isn't itself a human edit — only a
// further change beyond this baseline is, so `save()` diffs against this
// rather than against `props.note.content` directly (#606).
const aiContentSnapshot = ref<string | null>(props.note?.content ?? null);
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
// Image generation runs through the shared provider abstraction on both the
// server-side and BYOK local-vault paths, and both support every provider we
// expose (OpenAI, Google Gemini). The button only needs a configured
// image provider — not specifically OpenAI.
const hasImageProvider = computed(() => !!(campaignStore.activeCampaign?.image_provider ?? "openai"));
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

function onChroniclerStarted(job: { jobId: string; prompt: string; size: string }) {
  rteRef.value?.insertPendingImageAtCursor(job);
}

function onChroniclerSelect(url: string) {
  rteRef.value?.insertImageAtCursor(url);
}

function onChroniclerWrite(rawMarkdown: string, provenance: AiProvenance | null) {
  rteRef.value?.insertChronicleContent(rawMarkdown, provenance?.model ?? null);
  if (provenance) {
    aiProvenance.value = provenance;
    // insertChronicleContent() runs synchronously through Tiptap's onUpdate →
    // emit("update:modelValue") → this component's v-model handler, so `body`
    // already reflects the insert here. Accepting the AI draft as-is isn't a
    // human edit, so move the baseline forward to match.
    aiContentSnapshot.value = body.value;
  }
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
    ai_provenance: aiProvenance.value,
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
  // Per-player diff, unlike the boolean above: adding a player to an
  // already-shared note must still email that player.
  const previouslyVisibleTo = new Set(props.note?.player_visible_to ?? []);
  const newlyVisibleTo = playerVisibleTo.value.filter((id) => !previouslyVisibleTo.has(id));
  try {
    if (props.note) {
      // Material edit detection (#606): only the body counts — title,
      // category, pin state, tags and visibility aren't AI-authored content.
      // Diffed against the last known AI-authored snapshot, not the loaded
      // content directly, so accepting a Chronicle draft as-is doesn't
      // itself count as an edit (see aiContentSnapshot above).
      if (body.value !== aiContentSnapshot.value) {
        aiProvenance.value = markEdited(aiProvenance.value);
      }

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
      notifyNoteShared(props.note.id, newlyVisibleTo);
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
      notifyNoteShared(created.id, newlyVisibleTo);
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
  } catch {
    // failure is surfaced to the user by the mutation's onError toast
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

.note-editor :deep(.ProseMirror) {
  @apply text-body text-foreground outline-none min-h-96;
}
.note-editor :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed;
}
.note-editor :deep(.ProseMirror h1) {
  @apply text-title font-bold mb-3 mt-5 first:mt-0;
}
.note-editor :deep(.ProseMirror h2) {
  @apply text-heading-lg font-bold mb-2 mt-4 first:mt-0;
}
.note-editor :deep(.ProseMirror h3) {
  @apply text-heading-sm font-bold mb-2 mt-3 first:mt-0;
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
