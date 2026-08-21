<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-heading-lg font-bold text-foreground">Adventure Journal</h2>
      <div class="flex items-center gap-2">
        <AppButton
          v-if="ui.journalHasActiveFilters && (activeTab === 'mine' || activeTab === 'party')"
          variant="subtle"
          size="md"
          label="Clear"
          @click="ui.resetJournalFilters()"
        />
        <SortControl
          v-if="showSort"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          :options="sortOptions"
        />
        <AppButton
          v-if="!activeTome && activeTab !== 'dm-notes' && activeTab !== 'quest-log' && activeTab !== 'puzzles'"
          variant="primary"
          size="md"
          :icon="IconAdd"
          label="New Entry"
          @click="openNew"
        />
      </div>
    </div>

    <!-- New entry form -->
    <div v-if="showForm" class="rounded-lg border border-primary/30 bg-card overflow-hidden shadow-sm">
      <div
        class="h-1 w-full"
        :style="{ backgroundColor: JOURNAL_CATEGORIES[formCategory].color }"
      />
      <div class="p-4 flex flex-col gap-3">
        <!-- Category + title row -->
        <div class="flex flex-wrap items-center gap-2">
          <AppSelect
            v-model="formCategory"
            tone="muted"
            :style="{ color: JOURNAL_CATEGORIES[formCategory].color }"
          >
            <option v-for="[key, cat] in JOURNAL_CATEGORY_LIST" :key="key" :value="key">
              {{ cat.label }}
            </option>
          </AppSelect>
          <AppInput
            v-model="formTitle"
            tone="underline"
            size="lg"
            placeholder="Entry title (optional)…"
            class="flex-1 min-w-48 font-bold placeholder:text-muted-foreground/60"
          />
        </div>

        <!-- Content -->
        <RichTextEditor v-model="formContent" placeholder="Write your entry…" size="lg" allow-upload :entity-mention-items="mentionItems" />

        <!-- Context link row -->
        <div class="flex flex-wrap items-center gap-2">
          <AppSelect
            v-model="formRefType"
            tone="muted"
            class="text-muted-foreground"
            @change="formRefId = ''"
          >
            <option value="">No context</option>
            <option value="quest">Quest</option>
            <option value="npc">NPC</option>
            <option value="location">Location</option>
            <option value="item">Item</option>
            <option value="monster">Monster</option>
          </AppSelect>
          <AppSelect
            v-if="formRefType"
            v-model="formRefId"
            tone="muted"
            size="body"
            weight="normal"
            class="flex-1 min-w-32"
          >
            <option value="">— Select —</option>
            <option v-for="opt in refOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</option>
          </AppSelect>
        </div>

        <!-- Footer row: privacy + actions -->
        <div class="flex items-center justify-between gap-2 pt-1">
          <div class="flex items-center gap-2 flex-wrap">
            <AppButton
              variant="subtle"
              size="sm"
              :active="!formIsPrivate"
              :tone="formIsPrivate ? undefined : 'success'"
              :icon="formIsPrivate ? IconLock : IconReveal"
              icon-size="xs"
              :label="formIsPrivate ? 'Private' : 'Shared'"
              @click="toggleFormPrivacy"
            />
            <AppCheckbox
              v-if="formIsPrivate"
              v-model="formSharedWithDm"
              size="sm"
              accent="amber"
              label-role="label-lg"
              label-weight="normal"
          label-class="text-amber-600/80 dark:text-amber-400/80"
              label="Share with DM"
            />
          </div>
          <div class="flex items-center gap-2">
            <AppButton variant="ghost" size="inline" @click="cancelForm">Cancel</AppButton>
            <AppButton
              variant="primary"
              size="sm"
              :icon="IconSave"
              :loading="saving"
              :disabled="isRteEmpty(formContent) || saving"
              @click="submitNew"
            >{{ saving ? 'Saving…' : 'Add Entry' }}</AppButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab bar -->
    <TabBar :tabs="TABS" :model-value="activeTab" @update:model-value="setTab" />

    <!-- Tome tabs — one per document item currently in the party's inventory -->
    <PlayerJournalTomeStrip
      v-if="tomeTabs.length"
      :tome-tabs="tomeTabs"
      :active-tab="activeTab"
      @update:active-tab="setTab"
    />

    <!-- Quest Log tab -->
    <PlayerJournalQuestLogTab
      v-if="activeTab === 'quest-log'"
      :is-loading="loadingQuests"
      :quests="playerQuests ?? []"
      :quest-groups="questGroups"
      :is-quest-new="isQuestNew"
    />

    <!-- Puzzles tab -->
    <PlayerJournalPuzzlesTab
      v-else-if="activeTab === 'puzzles'"
      :is-loading="loadingPuzzles"
      :puzzles="puzzles ?? []"
    />

    <!-- DM Notes tab -->
    <PlayerJournalDmNotesTab
      v-else-if="activeTab === 'dm-notes'"
      :is-loading="loadingNotes"
      :dm-notes="dmNotes"
      :selected-note="selectedNote"
      :is-note-new="isNoteNew"
      :format-date="formatDate"
      :NOTE_CATEGORIES="NOTE_CATEGORIES"
      @toggle-note="toggleNote"
    />

    <!-- Party Journal tab -->
    <PlayerJournalPartyTab
      v-else-if="activeTab === 'party'"
      :is-loading="isLoading"
      :visible-entries="visibleEntries"
      :filter-category="filterCategory"
      :expanded="expanded"
      :category-icon="categoryIcon"
      :content-preview="contentPreview"
      :format-date="formatDate"
      :author-name="authorName"
      @update:filter-category="filterCategory = $event"
      @toggle="toggleExpand"
    />

    <!-- Tome tab (dynamic — one of tomeTabs is active) -->
    <PlayerJournalTomeTab
      v-else-if="activeTome"
      :item="activeTome.item"
    />

    <!-- My Journal tab (default) -->
    <PlayerJournalMyTab
      v-else
      :is-loading="isLoading"
      :visible-entries="visibleEntries"
      :sort-by="sortBy"
      :filter-category="filterCategory"
      :expanded="expanded"
      :editing-id="editingId"
      :edit-form="editForm"
      :edit-ref-options="editRefOptions"
      :saving="saving"
      :mention-items="mentionItems"
      :category-icon="categoryIcon"
      :content-preview="contentPreview"
      :format-date="formatDate"
      :is-rte-empty="isRteEmpty"
      @update:filter-category="filterCategory = $event"
      @toggle="toggleExpand"
      @start-edit="startEdit"
      @remove-entry="removeEntry"
      @edit-form-change="(patch) => Object.assign(editForm, patch)"
      @cancel-edit="cancelEdit"
      @submit-edit="submitEdit"
      @reorder="reorderMyEntries"
    />
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAdd, IconCalendarDays, IconDocument, IconFeather, IconLocation, IconLock, IconMessage, IconPopulate, IconReveal, IconSave, IconScrollText, IconSearch, IconShield, IconStar } from '@/lib/icons';
import TabBar from "@/components/common/TabBar.vue";
import SortControl from "@/components/common/SortControl.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import PlayerJournalMyTab from "./PlayerJournalMyTab.vue";
import PlayerJournalPartyTab from "./PlayerJournalPartyTab.vue";
import PlayerJournalDmNotesTab from "./PlayerJournalDmNotesTab.vue";
import PlayerJournalQuestLogTab from "./PlayerJournalQuestLogTab.vue";
import PlayerJournalPuzzlesTab from "./PlayerJournalPuzzlesTab.vue";
import PlayerJournalTomeTab from "./PlayerJournalTomeTab.vue";
import PlayerJournalTomeStrip from "./PlayerJournalTomeStrip.vue";
import type { Component } from "vue";
import {
  useMyJournalEntries, useSharedJournalEntries,
  useCreateJournalEntry, useUpdateJournalEntry, useDeleteJournalEntry,
  useReorderJournalEntries,
  JOURNAL_CATEGORIES, JOURNAL_CATEGORY_LIST,
} from "@/composables/usePlayerJournal";
import { useUiStore } from "@/stores/ui";
import { storeToRefs } from "pinia";
import { sortEntities, type SortField } from "@/lib/noteSort";
import { useReadItems, useMarkRead } from "@/composables/useReadItems";
import type { JournalCategory, PlayerJournalEntry, JournalRefType } from "@/composables/usePlayerJournal";
import { usePlayerVisibleQuests } from "@/composables/useQuests";
import type { Quest } from "@/types/quest.types";
import { usePlayerVisiblePuzzles } from "@/composables/usePuzzles";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useSharedLocations } from "@/composables/useLocations";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { usePlayerVisibleItems } from "@/composables/useItems";
import { usePlayerVisibleMonsters } from "@/composables/useMonsters";
import { usePlayerDiscoveries } from "@/composables/useDiscoveredMonsters";
import { useNotes } from "@/composables/useNotes";
import { usePlayerEntityMentionItems } from "@/composables/usePlayerEntityMentionItems";
import type { NoteCategory } from "@/types/notes.types";
import { useAuthStore } from "@/stores/auth";
import { useMemberByUserId } from "@/composables/useCampaignMembers";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { removeRichTextImages, cleanupRemovedRichTextImages } from "@/composables/useImageUpload";

// ── Mention items ─────────────────────────────────────────────────────────────
const { mentionItems } = usePlayerEntityMentionItems();

// ── Data ───────────────────────────────────────────────────────────────────────
const { data: myEntries,     isLoading: loadingMine }   = useMyJournalEntries();
const { data: sharedEntries, isLoading: loadingShared } = useSharedJournalEntries();
const isLoading = computed(() => loadingMine.value || loadingShared.value);
const { memberByUserId } = useMemberByUserId();

// Entity data for context picker — player-scoped to avoid leaking DM data
const auth = useAuthStore();
const { data: playerQuests, isLoading: loadingQuests } = usePlayerVisibleQuests();
const { data: puzzles, isLoading: loadingPuzzles } = usePlayerVisiblePuzzles();
const { data: sharedNpcs }        = useSharedNpcs();
const { data: sharedLocations }   = useSharedLocations();
const { data: inventory }         = usePartyInventory();
const { data: allVisibleItems }   = usePlayerVisibleItems();
const { data: allMonsters }       = usePlayerVisibleMonsters();
const { data: playerDiscoveries } = usePlayerDiscoveries();

// ── Mutations ─────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateJournalEntry();
const { mutateAsync: update } = useUpdateJournalEntry();
const { mutateAsync: del }    = useDeleteJournalEntry();
const { mutate: reorderJournal } = useReorderJournalEntries();

// ── Sort ────────────────────────────────────────────────────────────────────────
const ui = useUiStore();
const { journalSortBy: sortBy, journalSortDir: sortDir, journalFilterCategory: filterCategory } = storeToRefs(ui);

const SORT_OPTIONS_FULL = [
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "title", label: "Title A–Z" },
  { value: "manual", label: "Manual" },
] as const satisfies readonly { value: SortField; label: string }[];
// Party Journal holds other players' entries, which the current player can't reorder.
const SORT_OPTIONS_NO_MANUAL = SORT_OPTIONS_FULL.filter((o) => o.value !== "manual");

const showSort = computed(() => ["mine", "party", "dm-notes"].includes(activeTab.value));
const sortOptions = computed(() =>
  activeTab.value === "party" ? SORT_OPTIONS_NO_MANUAL : SORT_OPTIONS_FULL,
);

function reorderMyEntries(ids: string[]) {
  reorderJournal(ids);
}

// ── Category icon map ─────────────────────────────────────────────────────────
const CAT_ICONS: Record<JournalCategory, Component> = {
  adventure: IconScrollText,
  clue:      IconSearch,
  discovery: IconStar,
  session:   IconCalendarDays,
  character: IconFeather,
  rumor:     IconMessage,
};
function categoryIcon(cat: string): Component {
  return CAT_ICONS[cat as JournalCategory] ?? IconPopulate;
}

// ── DM Notes ──────────────────────────────────────────────────────────────────
const { data: notesRaw, isLoading: loadingNotes } = useNotes();
const dmNotes = computed(() => {
  const list = notesRaw.value ?? [];
  // Pinned float to the top (except in manual mode, which is a pure user order);
  // within each group apply the chosen sort.
  if (sortBy.value === "manual") return sortEntities(list, "manual", sortDir.value);
  const pinned = sortEntities(list.filter((n) => n.is_pinned), sortBy.value, sortDir.value);
  const rest = sortEntities(list.filter((n) => !n.is_pinned), sortBy.value, sortDir.value);
  return [...pinned, ...rest];
});

const NOTE_CATEGORIES: Record<NoteCategory, { label: string; color: string; icon: Component }> = {
  general:  { label: "General",  color: "#6b7280", icon: IconDocument },
  session:  { label: "Session",  color: "#3b82f6", icon: IconCalendarDays },
  lore:     { label: "Lore",     color: "#a855f7", icon: IconPopulate },
  location: { label: "Location", color: "#10b981", icon: IconLocation },
  quest:    { label: "Quest",    color: "#f59e0b", icon: IconScrollText },
  faction:  { label: "Faction",  color: "#06b6d4", icon: IconShield },
};

const { isNew: isNoteNew } = useReadItems("note");
const { isNew: isQuestNew } = useReadItems("quest");
const { mutate: markRead } = useMarkRead();

const selectedNote = ref<string | null>(null);
function toggleNote(id: string) {
  if (selectedNote.value !== id) markRead({ entityType: "note", entityId: id });
  selectedNote.value = selectedNote.value === id ? null : id;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const route = useRoute();
const router = useRouter();

// `(string & {})` (see quest.types.ts QuestBeatKind for the same trick) keeps
// the five static ids literal for autocomplete/comparison while still
// admitting an arbitrary tome item id — TabBar's own T stays inferred as
// this widened type wherever activeTab feeds it, so the static tabs simply
// show none-active while a tome tab is open.
type TabId = "mine" | "party" | "quest-log" | "puzzles" | "dm-notes" | (string & {});
const VALID_TABS: TabId[] = ["mine", "party", "quest-log", "puzzles", "dm-notes"];

// One tab per document item currently in the party's inventory — derived
// from the inventory + player-visible-items queries rather than stored
// state, so losing the item drops its inventory row, which drops it here,
// which drops the tab. Both queries live-sync already.
const tomeTabs = computed(() => {
  const carriedItemIds = new Set(
    (inventory.value ?? [])
      .map((inv) => inv.item_id)
      .filter((id): id is string => id !== null),
  );
  return (allVisibleItems.value ?? [])
    .filter((it) => carriedItemIds.has(it.id) && it.content !== null)
    .map((it) => ({ id: it.id, label: it.name, item: it }));
});

const activeTab = computed<TabId>(() => {
  const q = route.query.tab as string;
  if (VALID_TABS.includes(q as TabId)) return q as TabId;
  if (tomeTabs.value.some((t) => t.id === q)) return q as TabId;
  return "mine";
});
const activeTome = computed(() => tomeTabs.value.find((t) => t.id === activeTab.value) ?? null);
function setTab(id: TabId) {
  router.replace({ query: { tab: id } });
}

const TABS = computed(() => [
  { id: "mine"      as const, label: "My Journal",    count: myEntries.value?.length ?? 0 },
  { id: "party"     as const, label: "Party Journal", count: sharedEntries.value?.length ?? 0 },
  // Count only quests that fall into a rendered group (see questGroups) — shared
  // `undiscovered` quests would otherwise inflate the badge past the visible list.
  { id: "quest-log" as const, label: "Quest Log",     count: (playerQuests.value ?? []).filter((q) => QUEST_LOG_STATUSES.includes(q.status)).length },
  { id: "puzzles"   as const, label: "Puzzles",       count: puzzles.value?.length ?? 0 },
  { id: "dm-notes"  as const, label: "DM Notes",      count: dmNotes.value.length },
]);

// Deep link from note-share emails: /play/journal?tab=dm-notes&note=<id>
// expands that note and scrolls to it. Watches dmNotes too because on a cold
// load the target card doesn't exist until the notes query resolves. The
// param is dropped afterwards so collapse/refresh behaves normally.
watch(
  [() => route.query.note, dmNotes],
  async ([noteId]) => {
    if (typeof noteId !== "string" || activeTab.value !== "dm-notes") return;
    if (!dmNotes.value.some((n) => n.id === noteId)) return;
    markRead({ entityType: "note", entityId: noteId });
    selectedNote.value = noteId;
    await nextTick();
    document.getElementById(`dm-note-${noteId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    void router.replace({ query: { tab: "dm-notes" } });
  },
  { immediate: true },
);

// Statuses that render in a Quest Log group — the badge counts exactly these.
const QUEST_LOG_STATUSES: readonly string[] = ["active", "rumor", "completed", "failed"];

const questGroups = computed<[string, Quest[]][]>(() => [
  ["Active",    (playerQuests.value ?? []).filter((q) => q.status === "active")],
  ["Rumors",    (playerQuests.value ?? []).filter((q) => q.status === "rumor")],
  ["Completed", (playerQuests.value ?? []).filter((q) => q.status === "completed")],
  ["Failed",    (playerQuests.value ?? []).filter((q) => q.status === "failed")],
]);

// ── Filters ───────────────────────────────────────────────────────────────────
// filterCategory lives in useUiStore (Filter State Pattern) — survives navigation.

const visibleEntries = computed(() => {
  let entries = activeTab.value === "mine"
    ? (myEntries.value ?? [])
    : (sharedEntries.value ?? []);
  if (filterCategory.value) {
    entries = entries.filter((e) => e.category === filterCategory.value);
  }
  return sortEntities(entries, sortBy.value, sortDir.value);
});

// ── Expand/collapse ───────────────────────────────────────────────────────────
const expanded  = ref<string | null>(null);
const editingId = ref<string | null>(null);

function toggleExpand(id: string) {
  if (expanded.value === id) {
    expanded.value  = null;
    editingId.value = null;
  } else {
    expanded.value  = id;
    editingId.value = null;
  }
}

// ── New entry form ────────────────────────────────────────────────────────────
const showForm   = ref(false);

const formCategory   = ref<JournalCategory>("adventure");
const formTitle      = ref("");
const formContent    = ref("");
const formIsPrivate    = ref(true);
const formSharedWithDm = ref(false);
const formRefType      = ref<JournalRefType | "">("");
const formRefId      = ref("");
const saving         = ref(false);

function openNew() {
  showForm.value = true;
}

function toggleFormPrivacy() {
  formIsPrivate.value = !formIsPrivate.value;
  if (!formIsPrivate.value) formSharedWithDm.value = false;
}

function cancelForm() {
  showForm.value = false;
  formTitle.value = "";
  formContent.value = "";
  formRefType.value = "";
  formRefId.value = "";
  formSharedWithDm.value = false;
}

// Context options based on selected ref type (shared between create + edit forms)
function getRefOptions(refType: string): { id: string; name: string }[] {
  switch (refType) {
    case "quest":     return (playerQuests.value ?? []).map((q) => ({ id: q.id, name: q.title }));
    case "npc":       return (sharedNpcs.value ?? []).map((n) => ({ id: n.id, name: n.name ?? "???" }));
    case "location":  return (sharedLocations.value ?? []).map((l) => ({ id: l.id, name: l.name }));
    case "item": {
      const myMemberId = auth.linkedPartyMemberId;
      return (inventory.value ?? [])
        .filter((i) => i.carried_by === myMemberId || i.carried_by === null)
        .map((i) => ({ id: i.id, name: i.name }));
    }
    case "monster": {
      const discoveries = playerDiscoveries.value ?? [];
      const monsters = allMonsters.value ?? [];
      return discoveries.flatMap((d) => {
        const m = monsters.find((m) => d.library_monster_id ? m.id === d.library_monster_id : m.id === d.monster_id);
        return m ? [{ id: m.id, name: m.name }] : [];
      });
    }
    // "encounter" is intentionally not offered to players — useEncounters is
    // owner-only by RLS, so the list was always empty.
    default:          return [];
  }
}

const refOptions = computed(() => getRefOptions(formRefType.value));
const editRefOptions = computed(() => getRefOptions(editForm.value.ref_type));

function resolveLabel(refType: string, refId: string, options: { id: string; name: string }[]): string | null {
  if (!refType || !refId) return null;
  const opt = options.find((o) => o.id === refId);
  if (!opt) return null;
  return `${refType.charAt(0).toUpperCase() + refType.slice(1)}: ${opt.name}`;
}

async function submitNew() {
  if (isRteEmpty(formContent.value)) return;
  saving.value = true;
  try {
    await create({
      title:          formTitle.value.trim() || null,
      content:        formContent.value,
      category:       formCategory.value,
      tags:           [],
      is_private:     formIsPrivate.value,
      shared_with_dm: formSharedWithDm.value,
      ref_type:       (formRefType.value as JournalRefType) || null,
      ref_id:     formRefId.value || null,
      ref_label:  resolveLabel(formRefType.value, formRefId.value, refOptions.value),
    });
    cancelForm();
  } finally {
    saving.value = false;
  }
}

// ── Edit ──────────────────────────────────────────────────────────────────────
const editForm = ref({
  title:          "" as string | null,
  content:        "",
  category:       "adventure" as JournalCategory,
  is_private:     true,
  shared_with_dm: false,
  ref_type:       "" as string,
  ref_id:         "" as string,
});
const editOriginalContent = ref<string>("");

function startEdit(entry: PlayerJournalEntry) {
  editOriginalContent.value = entry.content;
  editForm.value = {
    title:          entry.title,
    content:        entry.content,
    category:       entry.category,
    is_private:     entry.is_private,
    shared_with_dm: entry.shared_with_dm,
    ref_type:       entry.ref_type ?? "",
    ref_id:         entry.ref_id ?? "",
  };
  editingId.value = entry.id;
}

function cancelEdit() {
  editingId.value = null;
  editOriginalContent.value = "";
}

async function submitEdit() {
  if (!editingId.value || isRteEmpty(editForm.value.content)) return;
  saving.value = true;
  const oldContent = editOriginalContent.value;
  try {
    await update({
      id: editingId.value,
      update: {
        title:          editForm.value.title?.trim() || null,
        content:        editForm.value.content,
        category:       editForm.value.category,
        is_private:     editForm.value.is_private,
        shared_with_dm: editForm.value.shared_with_dm,
        ref_type:       (editForm.value.ref_type as JournalRefType) || null,
        ref_id:     editForm.value.ref_id || null,
        ref_label:  resolveLabel(editForm.value.ref_type, editForm.value.ref_id, editRefOptions.value),
      },
    });
    cleanupRemovedRichTextImages(oldContent, editForm.value.content);
    editingId.value = null;
  } finally {
    saving.value = false;
  }
}

async function removeEntry(entry: PlayerJournalEntry) {
  if (!await confirm("Delete this journal entry?")) return;
  if (expanded.value === entry.id) expanded.value = null;
  await del(entry.id);
  removeRichTextImages(entry.content);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type TiptapNode = { type?: string; text?: string; content?: TiptapNode[] };

function extractNodeText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.content) return node.content.map(extractNodeText).join(
    node.type === "doc" || node.type === "paragraph" ? "\n" : "",
  );
  return "";
}

function plainText(content: string): string {
  try {
    return extractNodeText(JSON.parse(content) as TiptapNode).trim();
  } catch {
    return content;
  }
}

function isRteEmpty(val: string): boolean {
  return !val || plainText(val).length === 0;
}

function contentPreview(content: string): string {
  const text = plainText(content).replace(/\n+/g, " ").trim();
  return text.slice(0, 200) + (text.length > 200 ? "…" : "");
}

function authorName(entry: PlayerJournalEntry): string | null {
  return memberByUserId.value[entry.user_id]?.display_name ?? null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
</script>
