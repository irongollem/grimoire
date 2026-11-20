<template>
  <ListSkeleton v-if="isLoading" variant="stack" />
  <p v-else-if="error" class="py-12 text-center font-fell text-muted-foreground italic">
    The world could not be read just now. Try again in a moment.
  </p>
  <div v-else-if="!hasAnything" class="text-center py-12">
    <IconLibrary class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">Your DM has not told you anything of the world yet.</p>
  </div>
  <div v-else class="space-y-6">
    <section v-if="world.onlyMine.length" aria-labelledby="world-mine">
      <h2 id="world-mine" class="text-label text-muted-foreground mb-2">Only you know</h2>
      <ul class="rounded-lg border border-border bg-card divide-y divide-border">
        <li v-for="truth in world.onlyMine" :key="truth.id" class="px-4 py-3">
          <p class="text-body text-foreground">{{ truth.title }}</p>
          <p class="text-caption text-muted-foreground/70 italic mt-0.5">Only yours, until you tell the table.</p>
        </li>
      </ul>
    </section>

    <section v-if="world.known.length" aria-labelledby="world-known">
      <h2 id="world-known" class="text-label text-muted-foreground mb-2">What we know</h2>
      <ul class="rounded-lg border border-border bg-card divide-y divide-border">
        <li v-for="truth in world.known" :key="truth.id" class="px-4 py-3 text-body text-foreground">{{ truth.title }}</li>
      </ul>
    </section>

    <section v-if="world.lore.length" aria-labelledby="world-lore" class="space-y-2">
      <h2 id="world-lore" class="text-label text-muted-foreground">Found out</h2>
      <JournalCard
        v-for="item in world.lore"
        :id="`lore-${item.entry.id}`"
        :key="item.entry.id"
        color="var(--primary)"
        :icon="IconScrollText"
        :category-label="kindLabel(item)"
        :title="item.entry.title"
        :date="partsLabel(item.passages.length)"
        :expanded="openId === item.entry.id"
        @toggle="toggle(item)"
      >
        <template #meta>
          <EntityNewDot :is-new="isNew(item.entry.id, item.latestAt)" title="New" />
        </template>
        <div class="px-4 py-4 space-y-4">
          <img
            v-if="item.entry.image_url && !lowArt"
            :src="item.entry.image_url"
            alt=""
            loading="lazy"
            class="max-h-48 w-full rounded-md object-contain"
          />
          <RichTextViewer v-if="item.entry.body" :content="item.entry.body" />
          <article v-for="passage in item.passages" :key="passage.id" :data-testid="`passage-${passage.id}`">
            <div class="flex items-center gap-2">
              <h3 v-if="passage.title" class="text-heading-xs font-semibold text-foreground">{{ passage.title }}</h3>
              <span
                v-if="isPassageNew(passage.told_at, visitBefore(item.entry.id))"
                class="text-label text-destructive"
                data-testid="passage-new"
              >New</span>
            </div>
            <RichTextViewer v-if="passage.body" :content="passage.body" class="mt-1" />
          </article>
        </div>
      </JournalCard>
    </section>

    <section v-if="chronicle.length" aria-labelledby="world-chronicle" class="space-y-2">
      <h2 id="world-chronicle" class="text-label text-muted-foreground">The Chronicle</h2>
      <JournalCard
        v-for="note in chronicle"
        :id="`chronicle-${note.id}`"
        :key="note.id"
        color="#3b82f6"
        :icon="IconCalendarDays"
        :category-label="sessionNameOf(note.session_id) ?? 'Session'"
        :title="note.title"
        :date="worldDay(note)"
        :expanded="openNoteId === note.id"
        @toggle="toggleNote(note.id)"
      >
        <template #meta>
          <EntityNewDot :is-new="isNoteNew(note.id, note.updated_at)" title="New" />
          <AiGeneratedBadge variant="line" :provenance="note.ai_provenance" />
        </template>
        <div class="px-4 py-4">
          <NoteReading :note="note" class="mb-3" />
          <RichTextViewer :content="note.content ?? ''" />
          <TagChips :tags="note.tags ?? []" class="mt-3" />
        </div>
      </JournalCard>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * The World tab of the player journal (#1226, frame 08): the truths this player holds (what only they know, then what
 * the whole table knows) and the lore they have been told, each entry opening to the passages told so far. The reads
 * are the database's own projection, so nothing here filters by audience, and nothing says how much of a story is
 * still untold: the player's page never learns that a passage exists until it has been told.
 *
 * Unread uses `player_read_items` (type `canon_lore`, keyed by the entry): an entry is new when it last grew after the
 * player last opened it. The time of that last visit is held while the entry is open, so the passages told since can
 * be marked New even though opening it marks it read.
 */
import { computed, ref } from "vue";
import TagChips from "@/components/common/TagChips.vue";
import AiGeneratedBadge from "@/components/common/ai/AiGeneratedBadge.vue";
import NoteReading from "@/components/notes/NoteReading.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import EntityNewDot from "@/components/common/entity/EntityNewDot.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import JournalCard from "@/components/player/JournalCard.vue";
import { IconCalendarDays, IconLibrary, IconScrollText } from "@/lib/icons";
import { chronicleNotes, sessionOf } from "@/lib/notes/noteSessions";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import { usePlayerVisibleNotes } from "@/composables/notes/useNotes";
import { usePlayerSessions } from "@/composables/sessions/usePlayerSessions";
import { useCalendarStore } from "@/stores/calendar";
import type { Note } from "@/types/notes.types";
import { usePlayerCanon, isPassageNew, type PlayerLore } from "@/composables/canon/usePlayerCanon";
import { useMarkRead, useReadItems } from "@/composables/player/useReadItems";
import { useLowArt } from "@/composables/useLowArt";

const { world: worldRef, isLoading, error } = usePlayerCanon();
// A failed read says so (the query itself reports it to Sentry); it never reads as "nothing told yet".
const world = computed(() => worldRef.value ?? { onlyMine: [], known: [], lore: [] });
const hasAnything = computed(() => world.value.onlyMine.length + world.value.known.length + world.value.lore.length + chronicle.value.length > 0);

// The Chronicle: shared notes linked to a session. The read is the same RPC DM Notes uses, so secret blocks never
// arrive and a DM previewing a member sees exactly that member's notes.
const { data: notesRaw } = usePlayerVisibleNotes();
const { data: sessions } = usePlayerSessions();
const calendar = useCalendarStore();
const chronicle = computed(() => chronicleNotes(notesRaw.value ?? [], sessions.value));
const { isNew: isNoteNew } = useReadItems("note");
const openNoteId = ref<string | null>(null);
function toggleNote(id: string) {
  if (openNoteId.value !== id) markRead({ entityType: "note", entityId: id });
  openNoteId.value = openNoteId.value === id ? null : id;
}
function sessionNameOf(sessionId: string | null): string | null {
  const session = sessionOf(sessions.value, sessionId);
  return session ? sessionLabel(session) : null;
}
/** The session's day in the world, when the note has one. */
function worldDay(note: Note): string {
  if (note.session_start_year === null) return "";
  return calendar.adapter.formatDate(note.session_start_year, note.session_start_month, note.session_start_day, null);
}

const { lowArt } = useLowArt();
const { isNew, readAt } = useReadItems("canon_lore");
const { mutate: markRead } = useMarkRead();

const openId = ref<string | null>(null);
/** When the player last opened each entry, as of the moment they opened it this time. */
const visits = ref(new Map<string, Date | null>());
const visitBefore = (entryId: string) => visits.value.get(entryId) ?? null;

function toggle(item: PlayerLore) {
  const id = item.entry.id;
  if (openId.value === id) {
    openId.value = null;
    return;
  }
  openId.value = id;
  visits.value.set(id, readAt.value?.get(id) ?? null);
  markRead({ entityType: "canon_lore", entityId: id });
}

const kindLabel = (item: PlayerLore) => (item.entry.lore_kind ? item.entry.lore_kind.charAt(0).toUpperCase() + item.entry.lore_kind.slice(1) : "Lore");
const partsLabel = (n: number) => `${n} ${n === 1 ? "part" : "parts"} so far`;
</script>
