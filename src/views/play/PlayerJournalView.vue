<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-xl font-bold text-foreground">Adventure Journal</h2>
      <button
        v-if="activeTab !== 'dm-notes'"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="openNew"
      >
        <Plus class="h-3.5 w-3.5" />
        New Entry
      </button>
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
          <select
            v-model="formCategory"
            class="bg-muted border border-border rounded-md px-2 py-1.5 font-cinzel text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
            :style="{ color: JOURNAL_CATEGORIES[formCategory].color }"
          >
            <option v-for="[key, cat] in JOURNAL_CATEGORY_LIST" :key="key" :value="key">
              {{ cat.label }}
            </option>
          </select>
          <input
            v-model="formTitle"
            placeholder="Entry title (optional)…"
            class="flex-1 min-w-48 bg-transparent border-b border-border px-1 py-1 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <!-- Content -->
        <RichTextEditor v-model="formContent" placeholder="Write your entry…" min-height="140px" allow-upload />

        <!-- Context link row -->
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="formRefType"
            class="bg-muted border border-border rounded-md px-2 py-1.5 font-cinzel text-[11px] font-semibold text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="formRefId = ''"
          >
            <option value="">No context</option>
            <option value="quest">Quest</option>
            <option value="npc">NPC</option>
            <option value="location">Location</option>
            <option value="item">Item</option>
            <option value="monster">Monster</option>
            <option value="encounter">Encounter</option>
          </select>
          <select
            v-if="formRefType"
            v-model="formRefId"
            class="flex-1 min-w-32 bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— Select —</option>
            <option v-for="opt in refOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</option>
          </select>
        </div>

        <!-- Footer row: privacy + actions -->
        <div class="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 font-cinzel text-[11px] font-semibold tracking-wider transition-colors px-2 py-1 rounded border"
            :class="formIsPrivate
              ? 'text-muted-foreground border-border hover:border-foreground/30'
              : 'text-elven-green border-elven-green/30 bg-elven-green/10'"
            @click="formIsPrivate = !formIsPrivate"
          >
            <Lock v-if="formIsPrivate" class="h-3 w-3" />
            <Eye v-else class="h-3 w-3" />
            {{ formIsPrivate ? 'Private' : 'Shared' }}
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="font-cinzel text-xs text-muted-foreground hover:text-foreground tracking-wider transition-colors"
              @click="cancelForm"
            >Cancel</button>
            <button
              type="button"
              :disabled="isRteEmpty(formContent) || saving"
              class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-50 transition-opacity"
              @click="submitNew"
            >
              <Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin" />
              <Save v-else class="h-3.5 w-3.5" />
              {{ saving ? 'Saving…' : 'Add Entry' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab bar: My Journal / Party Journal / DM Notes -->
    <div class="flex items-center gap-0 border-b border-border">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider border-b-2 -mb-px transition-colors"
        :class="activeTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span v-if="tab.count > 0" class="ml-1.5 font-fell font-normal text-[10px] opacity-70">({{ tab.count }})</span>
      </button>
    </div>

    <!-- DM Notes tab -->
    <template v-if="activeTab === 'dm-notes'">
      <div v-if="loadingNotes" class="flex justify-center py-12">
        <LoadingSpinner />
      </div>
      <div v-else-if="!dmNotes.length" class="text-center py-12">
        <BookOpen class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p class="font-fell text-muted-foreground italic">No notes shared by your DM yet.</p>
      </div>
      <div v-else class="flex flex-col gap-2">
        <JournalCard
          v-for="note in dmNotes"
          :key="note.id"
          :color="NOTE_CATEGORIES[note.category]?.color ?? '#6b7280'"
          :icon="NOTE_CATEGORIES[note.category]?.icon ?? BookOpen"
          :category-label="NOTE_CATEGORIES[note.category]?.label ?? ''"
          :title="note.title"
          :date="formatDate(note.created_at)"
          :expanded="selectedNote === note.id"
          @toggle="toggleNote(note.id)"
        >
          <template #meta>
            <Pin v-if="note.is_pinned" class="h-2.5 w-2.5 text-primary shrink-0" />
            <span v-if="note.category === 'session' && note.session_num != null" class="font-fell text-[11px] text-muted-foreground/70 italic">Session {{ note.session_num }}</span>
            <span class="font-fell text-[11px] text-muted-foreground/70 italic">by DM</span>
          </template>
          <div class="px-4 py-4">
            <RichTextViewer :content="note.content ?? ''" />
            <div v-if="note.tags?.length" class="flex flex-wrap gap-1 mt-3">
              <span
                v-for="tag in note.tags"
                :key="tag"
                class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground tracking-wider"
              >{{ tag }}</span>
            </div>
          </div>
        </JournalCard>
      </div>
    </template>

    <!-- Journal tabs (mine + party) -->
    <template v-else>
      <!-- Category filter -->
      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          class="px-2.5 py-1 rounded-full font-cinzel text-[10px] font-semibold tracking-wider transition-colors border"
          :class="filterCategory === null
            ? 'bg-primary/15 text-primary border-primary/30'
            : 'text-muted-foreground border-border hover:border-foreground/30'"
          @click="filterCategory = null"
        >All</button>
        <button
          v-for="[key, cat] in JOURNAL_CATEGORY_LIST"
          :key="key"
          type="button"
          class="px-2.5 py-1 rounded-full font-cinzel text-[10px] font-semibold tracking-wider transition-colors border"
          :class="filterCategory === key
            ? 'border-current'
            : 'text-muted-foreground border-border hover:border-foreground/20'"
          :style="filterCategory === key ? { color: cat.color, backgroundColor: cat.color + '18', borderColor: cat.color + '60' } : {}"
          @click="filterCategory = (filterCategory === key ? null : key)"
        >{{ cat.label }}</button>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="flex justify-center py-12">
        <LoadingSpinner />
      </div>

      <!-- Empty state -->
      <div v-else-if="visibleEntries.length === 0" class="text-center py-16 space-y-3">
        <BookOpen class="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <p class="font-cinzel text-sm text-muted-foreground">
          {{ activeTab === 'party' ? 'No shared entries from the party yet.' : 'Your journal is empty.' }}
        </p>
        <p v-if="activeTab === 'mine'" class="font-fell text-xs text-muted-foreground italic">
          Record your adventures, clues, and discoveries.
        </p>
      </div>

      <!-- Entry feed -->
      <div v-else class="flex flex-col gap-2">
        <JournalCard
          v-for="entry in visibleEntries"
          :key="entry.id"
          :color="JOURNAL_CATEGORIES[entry.category]?.color ?? '#6b7280'"
          :icon="categoryIcon(entry.category)"
          :category-label="JOURNAL_CATEGORIES[entry.category]?.label ?? ''"
          :title="entry.title || contentPreview(entry.content)"
          :preview="entry.title ? contentPreview(entry.content) : undefined"
          :date="formatDate(entry.created_at)"
          :expanded="expanded === entry.id"
          @toggle="toggleExpand(entry.id)"
        >
          <template #meta>
            <span v-if="entry.ref_label" class="font-fell text-[11px] text-muted-foreground/70 italic truncate max-w-32">{{ entry.ref_label }}</span>
            <span v-if="activeTab === 'party' && authorName(entry)" class="font-fell text-[11px] text-muted-foreground/70 italic">by {{ authorName(entry) }}</span>
            <span
              v-if="activeTab === 'mine'"
              class="inline-flex items-center gap-1 font-cinzel text-[10px] tracking-wider"
              :class="entry.is_private ? 'text-muted-foreground/50' : 'text-elven-green'"
            >
              <Lock v-if="entry.is_private" class="h-2.5 w-2.5" />
              <Eye v-else class="h-2.5 w-2.5" />
              {{ entry.is_private ? 'Private' : 'Shared' }}
            </span>
          </template>

          <!-- View mode (party journal or not editing) -->
          <template v-if="activeTab === 'party' || editingId !== entry.id">
            <div class="px-4 py-4">
              <RichTextViewer :content="entry.content" />
              <div v-if="entry.tags?.length" class="flex flex-wrap gap-1 mt-3">
                <span
                  v-for="tag in entry.tags"
                  :key="tag"
                  class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground tracking-wider"
                >{{ tag }}</span>
              </div>
            </div>
            <div v-if="activeTab === 'mine'" class="flex items-center gap-3 px-4 py-2 border-t border-border bg-muted/20">
              <button
                type="button"
                class="font-cinzel text-[11px] text-primary tracking-wider hover:opacity-80 transition-opacity"
                @click="startEdit(entry)"
              >Edit</button>
              <button
                type="button"
                class="font-cinzel text-[11px] text-muted-foreground/60 tracking-wider hover:text-destructive transition-colors"
                @click="removeEntry(entry)"
              >Delete</button>
            </div>
          </template>

          <!-- Edit mode -->
          <div v-else class="p-4 flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <select
                v-model="editForm.category"
                class="bg-muted border border-border rounded-md px-2 py-1.5 font-cinzel text-xs font-semibold focus:outline-none"
                :style="{ color: JOURNAL_CATEGORIES[editForm.category as JournalCategory]?.color }"
              >
                <option v-for="[key, cat] in JOURNAL_CATEGORY_LIST" :key="key" :value="key">{{ cat.label }}</option>
              </select>
              <input
                v-model="editForm.title"
                placeholder="Entry title (optional)…"
                class="flex-1 min-w-32 bg-transparent border-b border-border px-1 py-1 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
              />
            </div>
            <RichTextEditor v-model="editForm.content" min-height="160px" allow-upload />
            <div class="flex flex-wrap items-center gap-2">
              <select
                v-model="editForm.ref_type"
                class="bg-muted border border-border rounded-md px-2 py-1.5 font-cinzel text-[11px] font-semibold text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                @change="editForm.ref_id = ''"
              >
                <option value="">No context</option>
                <option value="quest">Quest</option>
                <option value="npc">NPC</option>
                <option value="location">Location</option>
                <option value="item">Item</option>
                <option value="monster">Monster</option>
                <option value="encounter">Encounter</option>
              </select>
              <select
                v-if="editForm.ref_type"
                v-model="editForm.ref_id"
                class="flex-1 min-w-32 bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— Select —</option>
                <option v-for="opt in editRefOptions" :key="opt.id" :value="opt.id">{{ opt.name }}</option>
              </select>
            </div>
            <div class="flex items-center justify-between gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 font-cinzel text-[11px] font-semibold tracking-wider transition-colors px-2 py-1 rounded border"
                :class="editForm.is_private
                  ? 'text-muted-foreground border-border'
                  : 'text-elven-green border-elven-green/30 bg-elven-green/10'"
                @click="editForm.is_private = !editForm.is_private"
              >
                <Lock v-if="editForm.is_private" class="h-3 w-3" />
                <Eye v-else class="h-3 w-3" />
                {{ editForm.is_private ? 'Private' : 'Shared' }}
              </button>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="font-cinzel text-xs text-muted-foreground hover:text-foreground tracking-wider"
                  @click="cancelEdit"
                >Cancel</button>
                <button
                  type="button"
                  :disabled="isRteEmpty(editForm.content) || saving"
                  class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 disabled:opacity-50"
                  @click="submitEdit"
                >
                  <Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin" />
                  <Save v-else class="h-3.5 w-3.5" />
                  {{ saving ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
        </JournalCard>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed } from "vue";
import {
  Plus, Save, Loader2, Lock, Eye, BookOpen, Pin,
  Search, Star, CalendarDays, Feather, MessageCircle, ScrollText,
  FileText, MapPin, Shield,
} from "lucide-vue-next";
import JournalCard from "@/components/player/JournalCard.vue";
import type { Component } from "vue";
import {
  useMyJournalEntries, useSharedJournalEntries,
  useCreateJournalEntry, useUpdateJournalEntry, useDeleteJournalEntry,
  JOURNAL_CATEGORIES, JOURNAL_CATEGORY_LIST,
} from "@/composables/usePlayerJournal";
import type { JournalCategory, PlayerJournalEntry, JournalRefType } from "@/composables/usePlayerJournal";
import { usePlayerVisibleQuests } from "@/composables/useQuests";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useSharedLocations } from "@/composables/useLocations";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useAllMonsters } from "@/composables/useMonsters";
import { usePlayerDiscoveries } from "@/composables/useDiscoveredMonsters";
import { useEncounters } from "@/composables/useEncounters";
import { useNotes } from "@/composables/useNotes";
import type { NoteCategory } from "@/types/notes.types";
import { useAuthStore } from "@/stores/auth";
import { useMemberByUserId } from "@/composables/useCampaignMembers";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { removeRichTextImages, cleanupRemovedRichTextImages } from "@/composables/useImageUpload";

// ── Data ───────────────────────────────────────────────────────────────────────
const { data: myEntries,     isLoading: loadingMine }   = useMyJournalEntries();
const { data: sharedEntries, isLoading: loadingShared } = useSharedJournalEntries();
const isLoading = computed(() => loadingMine.value || loadingShared.value);
const { memberByUserId } = useMemberByUserId();

// Entity data for context picker — player-scoped to avoid leaking DM data
const auth = useAuthStore();
const { data: playerQuests }      = usePlayerVisibleQuests();
const { data: sharedNpcs }        = useSharedNpcs();
const { data: sharedLocations }   = useSharedLocations();
const { data: inventory }         = usePartyInventory();
const { data: allMonsters }       = useAllMonsters();
const { data: playerDiscoveries } = usePlayerDiscoveries();
const { data: allEncounters }     = useEncounters();

// ── Mutations ─────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateJournalEntry();
const { mutateAsync: update } = useUpdateJournalEntry();
const { mutateAsync: del }    = useDeleteJournalEntry();

// ── Category icon map ─────────────────────────────────────────────────────────
const CAT_ICONS: Record<JournalCategory, Component> = {
  adventure: ScrollText,
  clue:      Search,
  discovery: Star,
  session:   CalendarDays,
  character: Feather,
  rumor:     MessageCircle,
};
function categoryIcon(cat: string): Component {
  return CAT_ICONS[cat as JournalCategory] ?? BookOpen;
}

// ── DM Notes ──────────────────────────────────────────────────────────────────
const { data: notesRaw, isLoading: loadingNotes } = useNotes();
const dmNotes = computed(() =>
  (notesRaw.value ?? []).slice().sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (a.category === "session" && b.category === "session") {
      if (a.session_num !== null && b.session_num !== null) return a.session_num - b.session_num;
      if (a.session_num !== null) return -1;
      if (b.session_num !== null) return 1;
    }
    if (a.category === "session" && b.category !== "session") return -1;
    if (a.category !== "session" && b.category === "session") return 1;
    return a.title.localeCompare(b.title);
  }),
);

const NOTE_CATEGORIES: Record<NoteCategory, { label: string; color: string; icon: Component }> = {
  general:  { label: "General",  color: "#6b7280", icon: FileText },
  session:  { label: "Session",  color: "#3b82f6", icon: CalendarDays },
  lore:     { label: "Lore",     color: "#a855f7", icon: BookOpen },
  location: { label: "Location", color: "#10b981", icon: MapPin },
  quest:    { label: "Quest",    color: "#f59e0b", icon: ScrollText },
  faction:  { label: "Faction",  color: "#06b6d4", icon: Shield },
};

const selectedNote = ref<string | null>(null);
function toggleNote(id: string) {
  selectedNote.value = selectedNote.value === id ? null : id;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const activeTab = ref<"mine" | "party" | "dm-notes">("mine");
const TABS = computed(() => [
  { id: "mine"     as const, label: "My Journal",    count: myEntries.value?.length ?? 0 },
  { id: "party"    as const, label: "Party Journal", count: sharedEntries.value?.length ?? 0 },
  { id: "dm-notes" as const, label: "DM Notes",      count: dmNotes.value.length },
]);

// ── Filters ───────────────────────────────────────────────────────────────────
const filterCategory = ref<JournalCategory | null>(null);

const visibleEntries = computed(() => {
  const entries = activeTab.value === "mine"
    ? (myEntries.value ?? [])
    : (sharedEntries.value ?? []);
  if (filterCategory.value) {
    return entries.filter((e) => e.category === filterCategory.value);
  }
  return entries;
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
const formIsPrivate  = ref(true);
const formRefType    = ref<JournalRefType | "">("");
const formRefId      = ref("");
const saving         = ref(false);

function openNew() {
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  formTitle.value = "";
  formContent.value = "";
  formRefType.value = "";
  formRefId.value = "";
}

// Context options based on selected ref type (shared between create + edit forms)
function getRefOptions(refType: string): { id: string; name: string }[] {
  switch (refType) {
    case "quest":     return (playerQuests.value ?? []).map((q) => ({ id: q.id, name: q.title }));
    case "npc":       return (sharedNpcs.value ?? []).map((n) => ({ id: n.id, name: n.name }));
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
        const m = monsters.find((m) => d.srd_slug ? m.id === d.srd_slug : m.id === d.monster_id);
        return m ? [{ id: m.id, name: m.name }] : [];
      });
    }
    case "encounter": return (allEncounters.value ?? []).map((e) => ({ id: e.id, name: e.name }));
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
      title:      formTitle.value.trim() || null,
      content:    formContent.value,
      category:   formCategory.value,
      tags:       [],
      is_private: formIsPrivate.value,
      ref_type:   (formRefType.value as JournalRefType) || null,
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
  title:      "" as string | null,
  content:    "",
  category:   "adventure" as JournalCategory,
  is_private: true,
  ref_type:   "" as string,
  ref_id:     "" as string,
});
const editOriginalContent = ref<string>("");

function startEdit(entry: PlayerJournalEntry) {
  editOriginalContent.value = entry.content;
  editForm.value = {
    title:      entry.title,
    content:    entry.content,
    category:   entry.category,
    is_private: entry.is_private,
    ref_type:   entry.ref_type ?? "",
    ref_id:     entry.ref_id ?? "",
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
        title:      editForm.value.title?.trim() || null,
        content:    editForm.value.content,
        category:   editForm.value.category,
        is_private: editForm.value.is_private,
        ref_type:   (editForm.value.ref_type as JournalRefType) || null,
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
