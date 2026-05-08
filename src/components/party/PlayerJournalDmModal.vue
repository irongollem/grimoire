<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      @click.self="emit('close')"
      @keydown.escape="emit('close')"
    >
      <div class="w-full sm:max-w-lg bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <IconScrollText class="h-4 w-4 text-amber-500/80 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ playerName }}</p>
            <p class="font-fell text-xs text-muted-foreground italic">Shared with you privately</p>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            @click="emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>

        <!-- Feed -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="!entries.length" class="flex flex-col items-center justify-center py-16 gap-2">
            <IconScrollText class="h-8 w-8 text-muted-foreground/30" />
            <p class="font-fell text-sm text-muted-foreground italic">No entries shared yet.</p>
          </div>

          <div v-else class="flex flex-col gap-2 p-3">
            <JournalCard
              v-for="entry in entries"
              :key="entry.id"
              :color="categoryColor(entry.category)"
              :icon="categoryIcon(entry.category)"
              :category-label="categoryLabel(entry.category)"
              :title="entry.title || contentPreview(entry.content)"
              :preview="entry.title ? contentPreview(entry.content) : undefined"
              :date="formatDate(entry.created_at)"
              :expanded="expanded === entry.id"
              @toggle="toggleExpand(entry.id)"
            >
              <template #meta>
                <span
                  v-if="isNew(entry.id, entry.updated_at)"
                  class="h-2 w-2 rounded-full bg-destructive shrink-0"
                  title="New"
                />
              </template>
              <div class="px-4 py-4">
                <RichTextViewer :content="entry.content" />
                <div v-if="entry.tags?.length" class="flex flex-wrap gap-1 mt-3">
                  <span
                    v-for="tag in entry.tags"
                    :key="tag"
                    class="font-cinzel text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground tracking-wider"
                  >{{ tag }}</span>
                </div>
              </div>
            </JournalCard>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { Component } from "vue";
import {
  IconCalendarDays, IconClose, IconFeather, IconMessage,
  IconScrollText, IconSearch, IconStar,
} from "@/lib/icons";
import { JOURNAL_CATEGORIES } from "@/composables/usePlayerJournal";
import type { PlayerJournalEntry, JournalCategory } from "@/composables/usePlayerJournal";
import { useReadItems, useMarkRead } from "@/composables/useReadItems";
import JournalCard from "@/components/player/JournalCard.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const { playerName, entries } = defineProps<{
  playerName: string;
  entries: PlayerJournalEntry[];
}>();

const emit = defineEmits<{ close: [] }>();

// ── Read tracking ─────────────────────────────────────────────────────────────
const { isNew } = useReadItems("player_journal");
const { mutate: markRead } = useMarkRead();

watch(() => entries, (list) => {
  for (const e of list) markRead({ entityType: "player_journal", entityId: e.id });
}, { immediate: true });

// ── Expand/collapse ───────────────────────────────────────────────────────────
const expanded = ref<string | null>(null);

function toggleExpand(id: string) {
  expanded.value = expanded.value === id ? null : id;
}

// ── Category helpers ──────────────────────────────────────────────────────────
const CAT_ICONS: Record<JournalCategory, Component> = {
  adventure: IconScrollText,
  clue:      IconSearch,
  discovery: IconStar,
  session:   IconCalendarDays,
  character: IconFeather,
  rumor:     IconMessage,
};

function categoryColor(cat: string): string {
  return JOURNAL_CATEGORIES[cat as JournalCategory]?.color ?? "#6b7280";
}
function categoryLabel(cat: string): string {
  return JOURNAL_CATEGORIES[cat as JournalCategory]?.label ?? "";
}
function categoryIcon(cat: string): Component {
  return CAT_ICONS[cat as JournalCategory] ?? IconScrollText;
}

// ── Text helpers ──────────────────────────────────────────────────────────────
type TiptapNode = { type?: string; text?: string; content?: TiptapNode[] };

function extractText(node: TiptapNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.content) return node.content.map(extractText).join(
    node.type === "doc" || node.type === "paragraph" ? "\n" : "",
  );
  return "";
}

function contentPreview(content: string): string {
  try {
    const text = extractText(JSON.parse(content) as TiptapNode).replace(/\n+/g, " ").trim();
    return text.slice(0, 160) + (text.length > 160 ? "…" : "");
  } catch {
    return content.slice(0, 160);
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
</script>
