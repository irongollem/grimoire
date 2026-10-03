<template>
  <div class="flex flex-col gap-4">
    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Note title</span>
        <AppInput
          v-model="draft.title"
          tone="card"
          size="heading"
          placeholder="Note title…"
        />
      </label>

      <!-- Category -->
      <AppSelect v-model="draft.category" size="md">
        <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">
          {{ c.label }}
        </option>
      </AppSelect>

      <!-- Session # — only relevant for session notes -->
      <label v-if="draft.category === 'session'" class="flex items-center gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">#</span>
        <AppInput
          v-model.number="draft.sessionNum"
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
        :active="draft.isPinned"
        :icon="IconPin"
        :class="draft.isPinned ? '' : 'bg-card'"
        :tooltip="draft.isPinned ? 'Unpin note' : 'Pin note'"
        @click="draft.isPinned = !draft.isPinned"
      />

      <!-- Reveal to players -->
      <AudienceRevealControl
        :name="draft.title"
        :visible-to="draft.playerVisibleTo"
        @change="draft.playerVisibleTo = $event"
      />

      <AppButton
        :disabled="saving || !draft.title.trim()"
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
    <TagInput v-model="draft.tags" />

    <!-- ── Session date fields ──────────────────────────────────────────────── -->
    <NoteSessionDatesPanel
      v-if="draft.category === 'session'"
      v-model="draft.sessionDates"
      :is-new-note="!props.note"
      :linked-calendar-event-id="props.note?.linked_calendar_event_id ?? null"
    />

    <DraftConflictNotice :fields="conflictLabels" :on-discard="reset" />

    <p v-if="saveError" class="text-destructive text-body">
      {{ saveError }}
    </p>

    <!-- Tiptap editor -->
    <RichTextEditor
      ref="rteRef"
      v-model="draft.body"
      size="lg"
      placeholder="Write your note here…"
      allow-upload
      allow-calendar-events
      :entity-mention-items="entityMentionItems"
      :ai-context="`${draft.category} note${draft.title ? ` — ${draft.title}` : ''}`"
      @insert-calendar-event="showEventModal = true"
      @illustration-click="onIllustrationClick"
    >
      <template v-if="hasImageProvider || showWriteChronicle" #toolbar-end>
        <div class="w-px h-5 bg-border mx-0.5" />
        <AppButton
          v-if="showWriteChronicle"
          variant="ghost"
          size="icon-xs"
          :icon="IconNote"
          class="hover:bg-accent"
          tooltip="Write Chronicle"
          @click="openChroniclerWrite"
        />
        <template v-if="hasImageProvider">
          <AppButton
            v-if="campaignStore.isAiEnabled"
            variant="ghost"
            size="icon-xs"
            :icon="IconGenerate"
            class="hover:bg-accent"
            tooltip="Generate scene illustration"
            @click="openChroniclerGenerate"
          />
          <!-- Scene library browses images already generated — not itself a
               generation action, so it stays available regardless of the AI
               toggle. -->
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
    :note-title="draft.title"
    :note-session-num="draft.sessionNum"
    @close="showChroniclerWrite = false"
    @insert="onChroniclerWrite"
  />

  <ChroniclerLibraryPicker
    :visible="showChroniclerLibrary"
    @close="showChroniclerLibrary = false"
    @select="onChroniclerSelect"
  />

  <PaywallModal v-model="showPaywall" resource="notes" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed } from "vue";
import { useRecordDraft } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
import { useRouter, type RouteLocationNormalized } from "vue-router";
import { useUnsavedGuard } from "@/composables/useUnsavedGuard";
import RichTextEditor from "../common/RichTextEditor.vue";
import InlineCalendarEventModal from "@/components/calendar/InlineCalendarEventModal.vue";
import ChroniclerGenerateDialog from "./ChroniclerGenerateDialog.vue";
import ChroniclerLibraryPicker from "./ChroniclerLibraryPicker.vue";
import ChroniclerWriteDialog from "./ChroniclerWriteDialog.vue";
import NoteSessionDatesPanel from "./NoteSessionDatesPanel.vue";
import { IconDelete, IconGenerate, IconImages, IconNote, IconPin, IconSave } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import TagInput from "@/components/common/TagInput.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import {
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
} from "@/composables/notes/useNotes";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useNoteCalendarSync } from "@/composables/notes/useNoteCalendarSync";
import { useDeleteCalendarEvent } from "@/composables/calendar/useCalendarEvents";
import {
  removeRichTextImages,
  cleanupRemovedRichTextImages,
} from "@/composables/useImageUpload";
import type { Note, NoteCategory, NoteSessionDates } from "@/types/notes.types";
import type { ChronicleInsert } from "@/types/chronicler.types";
import type { CalendarEvent } from "@/types/calendar.types";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { normalizeTag } from "@/lib/tags";
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/campaign/useCampaignBroadcast";
import { notifyNoteShared } from "@/composables/campaign/useEmailNotify";
import { storeToRefs } from "pinia";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";

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

// The editor's local copy of the note (#946). Untouched fields follow the server
// when the note refetches; save() sends only the columns the DM changed.
interface NoteDraft {
  title: string;
  body: string | null;
  category: NoteCategory;
  sessionNum: number | null;
  isPinned: boolean;
  playerVisibleTo: string[];
  tags: string[];
  // Set when a Chronicle write is inserted (see onChroniclerWrite below);
  // preserved across unrelated edits so re-saving a note doesn't erase a prior
  // generation's record — never cleared back to null once populated (#606).
  aiProvenance: AiProvenance | null;
  // Grouped into one NoteSessionDates value — NoteSessionDatesPanel owns the
  // fields, the prefill-from-last-session logic, and the calendar adapter.
  sessionDates: NoteSessionDates;
  // Managed by syncSessionCalendarEvent — never edited here, carried so the
  // row builder sees it.
  linkedCalendarEventId: string | null;
}

function toDraft(note: Note | null): NoteDraft {
  return {
    title: note?.title ?? "",
    body: note?.content ?? null,
    category: note?.category ?? "general",
    sessionNum: note?.session_num ?? null,
    isPinned: note?.is_pinned ?? false,
    playerVisibleTo: [...(note?.player_visible_to ?? [])],
    tags: [...(note?.tags ?? [])],
    aiProvenance: note?.ai_provenance ?? null,
    sessionDates: {
      startYear:  note?.session_start_year ?? null,
      startMonth: note?.session_start_month ?? null,
      startDay:   note?.session_start_day ?? null,
      endYear:    note?.session_end_year ?? null,
      endMonth:   note?.session_end_month ?? null,
      endDay:     note?.session_end_day ?? null,
      realDate:   note?.session_real_date ?? null,
    },
    linkedCalendarEventId: note?.linked_calendar_event_id ?? null,
  };
}

const { draft, dirty, conflicts, changes, commit, reset } = useRecordDraft({
  source: () => props.note,
  identity: (note) => note.id,
  toDraft,
});

const CONFLICT_LABELS: Record<keyof NoteDraft, string> = {
  title: "Title",
  body: "Note text",
  category: "Category",
  sessionNum: "Session number",
  isPinned: "Pinned",
  playerVisibleTo: "Shared with",
  tags: "Tags",
  aiProvenance: "AI provenance",
  sessionDates: "Session dates",
  linkedCalendarEventId: "Calendar event",
};
const conflictLabels = computed(() => conflicts.value.map((key) => CONFLICT_LABELS[key]));

// The body as of the last Chronicle insert this session. Null until one happens:
// accepting an AI draft isn't itself a human edit, so save() diffs the body
// against this when set, and against the server's copy otherwise (#606).
const aiInsertedContent = ref<{ content: string | null } | null>(null);
// The title as of the last Chronicle insert that supplied one. Null unless the
// model actually wrote this note's title — a DM-written title is not AI-authored
// and must never be diffed as though it were.
const aiTitleSnapshot = ref<string | null>(null);
const saving = ref(false);
const deleting = ref(false);
const showPaywall = ref(false);
const saveError = ref("");

const { mentionItems: entityMentionItems } = useEntityMentionItems();

// ── Chronicler ────────────────────────────────────────────────────────────────
const showChroniclerGenerate = ref(false);
const showChroniclerLibrary  = ref(false);
const showChroniclerWrite    = ref(false);

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
// With AI off the generate/write controls are hidden outright; the scene
// library (browsing images already made) stays.
const showWriteChronicle = computed(() => hasTextProvider.value && campaignStore.isAiEnabled);

function openChroniclerGenerate() {
  // Defensive: the toolbar button is hidden while AI is off, so this only
  // guards a stray keyboard/programmatic trigger.
  if (!campaignStore.isAiEnabled) return;
  showChroniclerGenerate.value = true;
}

function openChroniclerWrite() {
  if (!campaignStore.isAiEnabled) return;
  showChroniclerWrite.value = true;
}

function onChroniclerStarted(job: { jobId: string; prompt: string; size: string }) {
  rteRef.value?.insertPendingImageAtCursor(job);
}

function onChroniclerSelect(url: string) {
  rteRef.value?.insertImageAtCursor(url);
}

function onChroniclerWrite(chronicle: ChronicleInsert) {
  rteRef.value?.insertChronicleContent(chronicle.markdown, chronicle.aiProvenance?.model ?? null);
  // The title line the model wrote is a title, not prose — the dialog parsed it
  // out and showed the DM exactly these two values before they pressed Insert.
  if (chronicle.title) {
    draft.title = chronicle.title;
    aiTitleSnapshot.value = chronicle.title;
  }
  if (chronicle.sessionNum !== null) {
    // The Session # field is only rendered for a session note, and
    // buildPayload() nulls the column for every other category — so a number
    // set without switching category would be dropped on save without a trace.
    draft.category = "session";
    draft.sessionNum = chronicle.sessionNum;
  }
  if (chronicle.tags.length > 0) {
    // Merge, not replace — the DM's own tag bar may already hold tags this
    // note started with. Skip anything already present under a different
    // spelling (stored tags are inconsistent — see reconcileChronicleTags).
    const already = new Set(draft.tags.map(normalizeTag));
    const toAdd = chronicle.tags.filter((t) => !already.has(normalizeTag(t)));
    draft.tags = [...draft.tags, ...toAdd];
  }
  if (chronicle.aiProvenance) {
    draft.aiProvenance = chronicle.aiProvenance;
    // insertChronicleContent() runs synchronously through Tiptap's onUpdate →
    // emit("update:modelValue") → this component's v-model handler, so `body`
    // already reflects the insert here. Accepting the AI draft as-is isn't a
    // human edit, so move the baseline forward to match.
    aiInsertedContent.value = { content: draft.body };
  }
}

const illustrationPrompt = ref("");

function onIllustrationClick(prompt: string) {
  // The chip renders inert while AI is off; this guards a stray trigger.
  if (!campaignStore.isAiEnabled) return;
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
const { mutateAsync: deleteCalEvent } = useDeleteCalendarEvent();
const { syncSessionCalendarEvent } = useNoteCalendarSync();
const { activeCampaignId } = storeToRefs(useCampaignStore());

// A pure function of its draft: useRecordDraft runs it over the server copy too,
// to find which columns the DM actually changed.
function buildPayload(d: NoteDraft) {
  const isSession = d.category === "session";
  return {
    title: d.title.trim() || "Untitled Note",
    category: d.category,
    session_num: isSession ? (d.sessionNum ?? null) : null,
    is_pinned: d.isPinned,
    player_visible_to: d.playerVisibleTo,
    tags: d.tags,
    content: d.body ?? null,
    ai_provenance: d.aiProvenance,
    session_start_year:  isSession ? (d.sessionDates.startYear ?? null) : null,
    session_start_month: isSession ? (d.sessionDates.startMonth ?? null) : null,
    session_start_day:   isSession ? (d.sessionDates.startDay ?? null) : null,
    session_end_year:    isSession ? (d.sessionDates.endYear ?? null) : null,
    session_end_month:   isSession ? (d.sessionDates.endMonth ?? null) : null,
    session_end_day:     isSession ? (d.sessionDates.endDay ?? null) : null,
    session_real_date:   isSession ? (d.sessionDates.realDate ?? null) : null,
    linked_calendar_event_id: d.linkedCalendarEventId,
  };
}

// ── Leaving with unsaved work ─────────────────────────────────────────────────
// A chronicle costs credits and exists only in this editor until Save, and the
// same is true of anything typed here. Navigating away — the browser's back
// button out of `?edit=true` most of all — used to discard all of it without a
// word. The payload is the comparison because it is already the exact set of
// values that would be written. The draft compares itself against the server copy.

const isDirty = dirty;

/** Whether NoteDetailView will still be rendering this editor afterwards. */
function editorSurvives(to: RouteLocationNormalized): boolean {
  return to.name === "note-new" || (to.name === "note-detail" && to.query.edit === "true");
}

// Registers both onBeforeRouteLeave and onBeforeRouteUpdate — the latter catches
// the browser's Back button dropping `?edit=true`, a same-route *update* that a
// leave guard alone never sees, even though NoteDetailView's v-if unmounts this
// editor a moment later all the same. See useUnsavedGuard's docstring.
const { allowLeave } = useUnsavedGuard({
  isDirty: () => isDirty.value,
  survives: editorSurvives,
  ask: () =>
    confirm("This note has unsaved changes, including any chronicle you inserted.", {
      title: "Discard changes",
      confirmLabel: "Discard",
    }),
});

// ── Session calendar event sync ───────────────────────────────────────────────
// syncSessionCalendarEvent itself (create/update/delete + the note write-back)
// lives in useNoteCalendarSync — see that module for the circular-FK ordering.
function calendarSyncInput(noteId: string) {
  return {
    noteId,
    title: draft.title,
    sessionNum: draft.sessionNum,
    dates: draft.sessionDates,
    isSession: draft.category === "session",
    existingEventId: props.note?.linked_calendar_event_id ?? null,
    campaignId: activeCampaignId.value,
  };
}

async function save() {
  if (!draft.title.trim() && !draft.body) return;
  saving.value = true;
  saveError.value = "";
  const wasShared = (props.note?.player_visible_to?.length ?? 0) > 0;
  const nowShared = draft.playerVisibleTo.length > 0;
  const justShared = nowShared && !wasShared;
  // Per-player diff, unlike the boolean above: adding a player to an
  // already-shared note must still email that player.
  const previouslyVisibleTo = new Set(props.note?.player_visible_to ?? []);
  const newlyVisibleTo = draft.playerVisibleTo.filter((id) => !previouslyVisibleTo.has(id));
  try {
    if (props.note) {
      // Material edit detection (#606): only AI-authored values count —
      // category, pin state, tags and visibility never are. The body always
      // can be, and the title can be too, since a Chronicle insert may have
      // written it. Both are diffed against the last known AI-authored
      // snapshot rather than the loaded row, so accepting a draft as-is isn't
      // itself an edit (see aiContentSnapshot / aiTitleSnapshot above).
      const titleEdited =
        aiTitleSnapshot.value !== null && draft.title.trim() !== aiTitleSnapshot.value;
      const aiBaseline = aiInsertedContent.value ? aiInsertedContent.value.content : props.note.content;
      if (draft.body !== aiBaseline || titleEdited) {
        draft.aiProvenance = markEdited(draft.aiProvenance);
      }

      const oldContent = props.note.content;
      // Only the columns the DM touched: the rest may have moved on the server
      // since this note loaded, and a whole-row write would put them back (#946).
      const changed = changes(buildPayload);
      if (Object.keys(changed).length > 0) await update({ id: props.note.id, update: changed });
      commit();
      cleanupRemovedRichTextImages(oldContent, draft.body);
      await syncSessionCalendarEvent(calendarSyncInput(props.note.id));
      if (justShared && activeCampaignId.value)
        void sendCampaignAnnouncement(
          activeCampaignId.value,
          `📜 Note shared: "${draft.title.trim()}"`,
          { entity_type: "note", entity_id: props.note.id },
        );
      notifyNoteShared(props.note.id, newlyVisibleTo);
      allowLeave();
      router.push("/notes");
    } else {
      const created = await create(buildPayload(draft));
      await syncSessionCalendarEvent(calendarSyncInput(created.id));
      if (nowShared && activeCampaignId.value)
        void sendCampaignAnnouncement(
          activeCampaignId.value,
          `📜 Note shared: "${created.title}"`,
          { entity_type: "note", entity_id: created.id },
        );
      notifyNoteShared(created.id, newlyVisibleTo);
      allowLeave();
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
    allowLeave();
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
