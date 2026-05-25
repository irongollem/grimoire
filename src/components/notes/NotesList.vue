<template>
  <div>
    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <div class="relative flex-1 min-w-48">
        <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search notes…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="cat in CATEGORY_OPTIONS"
          :key="cat.value"
          class="px-2.5 py-1.5 transition-colors"
          :class="categoryFilter === cat.value
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="categoryFilter = cat.value"
        >
          {{ cat.label }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !search && categoryFilter === 'all'"
      title="No notes yet"
      description="Begin recording your campaign's history, lore, and secrets."
    >
      <template #action>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          @click="handleNew"
        >
          Write your first note
        </button>
      </template>
    </EmptyState>

    <p v-else-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-12">
      No notes match your filters.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <div
        v-for="note in filtered"
        :key="note.id"
        class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Card link overlay (disabled for locked items) -->
        <RouterLink v-if="!lockedNoteIds.has(note.id)" :to="`/notes/${note.id}`" class="absolute inset-0 z-2" />

        <!-- Locked overlay for over-quota items -->
        <div
          v-if="lockedNoteIds.has(note.id)"
          class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-sm"
        >
          <IconLock class="h-4 w-4 text-muted-foreground" />
          <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">Locked</p>
          <RouterLink to="/billing" class="font-cinzel text-[9px] tracking-wider text-primary/80 hover:text-primary transition-colors">
            Upgrade to access
          </RouterLink>
        </div>

        <!-- Category colour bar -->
        <div class="h-1.5 w-full shrink-0" :style="{ backgroundColor: categoryColor(note.category) }" />

        <div class="p-3 flex flex-col gap-2 flex-1">
          <!-- Title row -->
          <div class="flex items-start gap-1.5">
            <IconPin v-if="note.is_pinned" class="h-3 w-3 shrink-0 mt-0.5 text-primary" />
            <IconReveal v-if="note.player_visible_to?.length" class="h-3 w-3 shrink-0 mt-0.5 text-elven-green" />
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1">
              {{ note.title || "Untitled Note" }}
            </h3>
          </div>

          <!-- Category + session -->
          <div class="flex items-center gap-2">
            <span
              class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider capitalize"
              :style="{ backgroundColor: categoryColor(note.category) + '22', color: categoryColor(note.category) }"
            >
              {{ note.category }}
            </span>
            <span v-if="note.session_num" class="font-fell text-xs text-muted-foreground italic">
              Session {{ note.session_num }}
            </span>
          </div>

          <!-- Content preview -->
          <p v-if="contentPreview(note)" class="font-fell text-xs text-muted-foreground italic line-clamp-3 flex-1">
            {{ contentPreview(note) }}
          </p>
          <div v-else class="flex-1" />

          <!-- Tags + date -->
          <div class="flex items-end justify-between gap-2 mt-auto">
            <div v-if="note.tags.length" class="flex flex-wrap gap-1">
              <span
                v-for="tag in note.tags.slice(0, 2)"
                :key="tag"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                {{ tag }}
              </span>
            </div>
            <span class="font-fell text-[10px] text-muted-foreground italic shrink-0 ml-auto">
              {{ timeAgo(note.updated_at) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
      {{ filtered.length }} of {{ notes?.length ?? 0 }} notes
    </p>
  </div>

  <PaywallModal v-model="showPaywall" resource="notes" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { IconLock, IconPin, IconReveal, IconSearch } from '@/lib/icons';
import { useNotes } from "@/composables/useNotes";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import { timeAgo, extractTiptapText } from "@/lib/utils";
import type { Note, NoteCategory } from "@/types/notes.types";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { useQuota } from "@/composables/useQuota";

const router = useRouter();
const { canCreate, quota: noteQuota } = useQuota("notes");
const showPaywall = ref(false);

function handleNew() {
  if (!canCreate.value) { showPaywall.value = true; return; }
  router.push("/notes/new");
}

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "session", label: "Session" },
  { value: "lore", label: "Lore" },
  { value: "location", label: "Location" },
  { value: "quest", label: "Quest" },
  { value: "faction", label: "Faction" },
];

const CATEGORY_COLORS: Record<NoteCategory, string> = {
  general:  "#6b7280",
  session:  "#2563eb",
  lore:     "#7c3aed",
  location: "#059669",
  quest:    "#d97706",
  faction:  "#dc2626",
};

const search = ref("");
const categoryFilter = ref("all");
const { data: notes, isLoading } = useNotes();

const lockedNoteIds = computed((): Set<string> => {
  const q = noteQuota.value;
  if (!q || q.unlimited || q.current <= q.limit) return new Set();
  const overCount = q.current - q.limit;
  const sorted = [...(notes.value ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return new Set(sorted.slice(-overCount).map((n) => n.id));
});

const filtered = computed(() => {
  let list = [...(notes.value ?? [])];
  // pinned first
  list.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  if (categoryFilter.value !== "all") list = list.filter((n) => n.category === categoryFilter.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  return list;
});

function categoryColor(cat: NoteCategory): string {
  return CATEGORY_COLORS[cat] ?? "#6b7280";
}

function contentPreview(note: Note): string {
  return extractTiptapText(note.content);
}
</script>
