<template>
  <AppModal :open="open" size="md" align="sheet" @close="dismiss" @after-leave="emit('close')">
    <ModalHeader
      :title="playerName"
      subtitle="Shared with you privately"
      :icon="IconScrollText"
      tone="caution"
      closeable
      @close="dismiss"
    />

    <!-- Feed -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div v-if="!entries.length" class="flex flex-col items-center justify-center py-16 gap-2">
        <IconScrollText class="h-8 w-8 text-muted-foreground/30" />
        <p class="text-body text-muted-foreground italic">No entries shared yet.</p>
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
                class="text-label px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >{{ tag }}</span>
            </div>
          </div>
        </JournalCard>
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import type { Component } from "vue";
import {
  IconCalendarDays, IconFeather, IconMessage,
  IconScrollText, IconSearch, IconStar,
} from "@/lib/icons";
import { JOURNAL_CATEGORIES } from "@/composables/notes/usePlayerJournal";
import type { PlayerJournalEntry, JournalCategory } from "@/composables/notes/usePlayerJournal";
import { useReadItems, useMarkRead } from "@/composables/play/useReadItems";
import JournalCard from "@/components/player/JournalCard.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";

const { playerName, entries } = defineProps<{
  playerName: string;
  entries: PlayerJournalEntry[];
}>();

const emit = defineEmits<{ close: [] }>();

// No `open` prop — the parent mounts this modal with `v-if`, so "mounted" is
// "open" (see EntityDetailModal for the same pattern). The local flag exists
// only to give AppModal's <Transition> something to animate: raised a tick
// after mount so the panel appears as a change rather than the initial render,
// and lowered on dismiss so the close animation plays before the parent's
// `v-if` tears the component down.
const open = ref(false);
onMounted(() => void nextTick(() => { open.value = true; }));
function dismiss() {
  open.value = false;
}

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
