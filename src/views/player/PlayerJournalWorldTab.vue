<template>
  <ListSkeleton v-if="isLoading" variant="stack" />
  <p v-else-if="error" class="py-12 text-center font-fell text-muted-foreground italic">
    The world could not be read just now. Try again in a moment.
  </p>
  <div v-else-if="!hasAnything" class="text-center py-12">
    <IconLibrary class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">Your DM has not told you anything of the world yet.</p>
    <PlayerWonders class="mt-6 text-left" />
    <PlayerLineRequest class="mt-6 text-left" />
  </div>
  <div v-else class="space-y-6">
    <div class="flex flex-wrap items-center gap-2" data-testid="world-filter">
      <AppInput v-model="ui.journalWorldSearch" type="search" tone="filled" size="body" class="min-w-[min(100%,14rem)] flex-1" placeholder="Search what you know…" aria-label="Search the world" />
      <AppButton v-if="ui.journalWorldHasActiveFilters" variant="ghost" size="sm" label="Clear" data-testid="world-filter-clear" @click="ui.resetJournalWorldFilters()" />
    </div>
    <p v-if="ui.journalWorldHasActiveFilters && shownCount === 0" class="py-6 text-center font-fell text-muted-foreground italic" data-testid="world-filter-empty">
      Nothing you know has those words.
    </p>

    <section v-if="world.premise.length" aria-labelledby="world-campaign" class="space-y-4">
      <h2 id="world-campaign" class="text-label text-muted-foreground mb-2">The campaign</h2>
      <div v-for="entry in pitches" :key="entry.id">
        <p class="text-body text-foreground">{{ entry.title }}</p>
        <RichTextViewer v-if="entry.body" :content="entry.body" class="mt-1" />
      </div>
      <div v-for="group in premiseGroups" :key="group.label">
        <h3 class="text-label text-muted-foreground mb-1">{{ group.label }}</h3>
        <ul class="rounded-lg border border-border bg-card divide-y divide-border">
          <li v-for="entry in group.entries" :key="entry.id" class="px-4 py-3">
            <p class="text-body text-foreground">{{ entry.title }}</p>
            <p v-if="premiseWord(entry)" class="text-caption text-muted-foreground/70 italic mt-0.5">{{ premiseWord(entry) }}</p>
            <RichTextViewer v-if="entry.body" :content="entry.body" class="mt-1" />
          </li>
        </ul>
      </div>
    </section>

    <section v-if="world.onlyMine.length" aria-labelledby="world-mine">
      <h2 id="world-mine" class="text-label text-muted-foreground mb-2">Only you know</h2>
      <ul class="rounded-lg border border-border bg-card divide-y divide-border">
        <li v-for="truth in world.onlyMine" :key="truth.id" class="px-4 py-3">
          <p class="text-body text-foreground">{{ truth.title }}<EntityNewDot :is-new="isToldNew(truth)" title="New" class="ml-2" /></p>
          <p class="text-caption text-muted-foreground/70 italic mt-0.5">Only yours, until you tell the table.</p>
          <RichTextViewer v-if="truth.body" :content="truth.body" class="mt-1" />
          <AppButton
            v-if="!readOnly"
            variant="outline"
            size="sm"
            label="Tell the party"
            class="mt-2"
            :loading="telling"
            data-testid="tell-party"
            @click="tellParty(truth)"
          />
        </li>
      </ul>
    </section>

    <section v-if="world.known.length" aria-labelledby="world-known">
      <h2 id="world-known" class="text-label text-muted-foreground mb-2">What we know</h2>
      <ul class="rounded-lg border border-border bg-card divide-y divide-border">
        <li v-for="truth in world.known" :key="truth.id" class="px-4 py-3">
          <p class="text-body text-foreground">{{ truth.title }}<EntityNewDot :is-new="isToldNew(truth)" title="New" class="ml-2" /></p>
          <p v-if="knownWithLabel(truth)" class="text-caption text-muted-foreground/70 italic mt-0.5" data-testid="known-with">{{ knownWithLabel(truth) }}</p>
          <RichTextViewer v-if="truth.body" :content="truth.body" class="mt-1" />
        </li>
      </ul>
    </section>

    <section v-if="world.revealed.length" aria-labelledby="world-revealed">
      <h2 id="world-revealed" class="text-label text-muted-foreground mb-2">Secrets revealed</h2>
      <ul class="rounded-lg border border-border bg-card divide-y divide-border">
        <li v-for="secret in world.revealed" :key="secret.id" class="px-4 py-3">
          <p class="text-body text-foreground">{{ secret.title }}<EntityNewDot :is-new="isToldNew(secret)" title="New" class="ml-2" /></p>
          <RichTextViewer v-if="secret.body" :content="secret.body" class="mt-1" />
        </li>
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
        :category-label="`${kindLabel(item)} · ${partsLabel(item.passages.length)}`"
        :title="item.entry.title"
        :date="loreDate(item.entry)"
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

    <PlayerFoundClues :rows="foundRows" />

    <PlayerBeliefs />

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

    <PlayerWonders />

    <PlayerLineRequest />
  </div>
</template>

<script setup lang="ts">
/**
 * The World tab of the player journal (#1226, frame 08): the truths this player holds (what only they know, then what
 * the whole table knows) and the lore they have been told, each entry opening to the passages told so far. The reads
 * are the database's own projection, so nothing here filters by audience, and nothing says how much of a story is
 * still untold: the player's page never learns that a passage exists until it has been told. A truth only this player
 * knows offers "Tell the party" (#1258 item 14); one shared with some says who ("You and Mira know"). Below the lore
 * sit what the party has found (#1258 item 23) and the player's own questions, "Things we wonder" (item 24).
 *
 * Unread uses `player_read_items` (type `canon_lore`, keyed by the entry): an entry is new when it last grew after the
 * player last opened it. The time of that last visit is held while the entry is open, so the passages told since can
 * be marked New even though opening it marks it read.
 */
import { computed, onBeforeUnmount, ref } from "vue";
import TagChips from "@/components/common/TagChips.vue";
import AiGeneratedBadge from "@/components/common/ai/AiGeneratedBadge.vue";
import NoteReading from "@/components/notes/NoteReading.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import PlayerBeliefs from "@/components/player/PlayerBeliefs.vue";
import PlayerLineRequest from "@/components/player/PlayerLineRequest.vue";
import PlayerFoundClues from "@/components/player/PlayerFoundClues.vue";
import PlayerWonders from "@/components/player/PlayerWonders.vue";
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
import { usePlayerCanon, filterPlayerWorld, isPassageNew, knownWithLabel, type PlayerCanonEntry, type PlayerLore } from "@/composables/canon/usePlayerCanon";
import { usePlayerFoundClues } from "@/composables/canon/usePlayerFoundClues";
import { useTellParty } from "@/composables/canon/useTellParty";
import { useAppUiStore } from "@/stores/ui/app";
import { useNotesUiStore } from "@/stores/ui/notes";
import { usePlayerBeliefs } from "@/composables/canon/usePlayerBeliefs";
import { entryDate, worldDateLabel } from "@/lib/canon/canonLore";
import { useMarkRead, useReadItems } from "@/composables/player/useReadItems";
import { useLowArt } from "@/composables/useLowArt";

const { world: worldRef, isLoading, error } = usePlayerCanon();
const { rows: foundRows } = usePlayerFoundClues();
const { tellParty, telling } = useTellParty();
/** A DM looking through a player's eyes reads, and does not tell the party on the player's behalf. */
const appUi = useAppUiStore();
const readOnly = computed(() => appUi.dmPreviewMode);
// A failed read says so (the query itself reports it to Sentry); it never reads as "nothing told yet".
const ui = useNotesUiStore();
const { beliefs } = usePlayerBeliefs();
/** What is told to this player, before the filter box narrows it: the empty state and "nothing matches" depend on it. */
const fullWorld = computed(() => worldRef.value ?? { onlyMine: [], known: [], lore: [], backstories: [], premise: [], revealed: [] });
const world = computed(() => filterPlayerWorld(fullWorld.value, ui.journalWorldSearch));
const shownCount = computed(() => world.value.onlyMine.length + world.value.known.length + world.value.revealed.length + world.value.lore.length);
const hasAnything = computed(
  () =>
    beliefs.value.length + fullWorld.value.onlyMine.length + fullWorld.value.known.length + fullWorld.value.lore.length + fullWorld.value.premise.length + fullWorld.value.revealed.length + foundRows.value.length + chronicle.value.length > 0,
);

const pitches = computed(() => world.value.premise.filter((e) => e.premise_kind === "pitch"));
/** Themes, table notes, then lines and veils together; a line or veil says which it is in words, not colour. */
const premiseGroups = computed(() =>
  [
    { label: "Themes", kinds: ["theme"] },
    { label: "At the table", kinds: ["table"] },
    { label: "Lines and veils", kinds: ["line", "veil"] },
  ]
    .map(({ label, kinds }) => ({ label, entries: world.value.premise.filter((e) => e.premise_kind !== null && kinds.includes(e.premise_kind)) }))
    .filter((g) => g.entries.length > 0),
);
function premiseWord(entry: PlayerCanonEntry): string | null {
  if (entry.premise_kind === "line") return "Line: never in the story";
  if (entry.premise_kind === "veil") return "Veil: happens off screen";
  return null;
}

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
const { isNew: isToldKnown } = useReadItems("canon_told");
/** A truth or secret the DM told the party is New until the player has been on this tab with it showing (#1279 item 27). */
const isToldNew = (e: PlayerCanonEntry) => e.revealed_at != null && isToldKnown(e.id, e.revealed_at);
// Marked read as the tab is left, so the dot is seen on this visit and gone on the next.
onBeforeUnmount(() => {
  if (readOnly.value) return;
  const w = world.value; // what was on screen: a line the filter hid was not seen
  for (const e of [...w.onlyMine, ...w.known, ...w.revealed]) if (isToldNew(e)) markRead({ entityType: "canon_told", entityId: e.id });
});
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
/** The lore's date in the world, in the campaign's calendar, the way the DM's lore shows it; empty when it has none. */
const loreDate = (e: PlayerCanonEntry) => worldDateLabel(entryDate(e), (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f)) ?? "";
const partsLabel = (n: number) => `${n} ${n === 1 ? "part" : "parts"} so far`;
</script>
