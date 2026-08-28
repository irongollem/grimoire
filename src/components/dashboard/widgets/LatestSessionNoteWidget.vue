<template>
  <DashboardWidget
    title="Last session"
    to="/notes"
    action-label="All notes →"
    :loading="notes === undefined"
    :empty="notes !== undefined && latest === undefined"
    empty-text="No session notes yet — write one and the last one shows here."
    max-height="none"
  >
    <RouterLink
      v-if="latest !== undefined"
      :to="`/notes/${latest.id}`"
      class="group flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-muted/30"
    >
      <div class="flex items-baseline justify-between gap-2">
        <p
          class="font-cinzel text-sm font-semibold text-foreground transition-colors group-hover:text-primary line-clamp-1"
        >
          {{ title }}
        </p>
        <span v-if="latest.session_num !== null" class="shrink-0 text-caption text-muted-foreground">
          #{{ latest.session_num }}
        </span>
      </div>
      <p v-if="playedOn !== null" class="text-caption text-muted-foreground italic">
        {{ playedOn }}
      </p>
      <p v-if="preview !== ''" class="text-caption text-muted-foreground line-clamp-4">
        {{ preview }}
      </p>
    </RouterLink>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * The last session's recap, one tap from the board (#764).
 *
 * "What happened last time" is the question every session opens with, and the
 * answer already existed as a note — behind a list, a category filter and a
 * click. This is the same note with none of that in front of it.
 *
 * Which note counts as the last one is the interesting part and lives in
 * `src/lib/dashboard/latestSessionNote.ts`: a session note carries three
 * different ideas of "when", and campaigns fill in different ones.
 *
 * `max-height="none"` because the card is a single clamped excerpt and is
 * therefore its own size. A scroll region around four lines of text would be
 * a scrollbar around nothing.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import { useNotes } from "@/composables/notes/useNotes";
import { extractTiptapText } from "@/lib/utils";
import { latestSessionNote } from "@/lib/dashboard/latestSessionNote";

const { data: notes } = useNotes();

/**
 * `undefined` from the query means the notes have not loaded; `undefined` from
 * the picker means the campaign has no session notes. The template keeps them
 * apart — one is a spinner and the other is an invitation to write one.
 */
const latest = computed(() => {
  const loaded = notes.value;
  if (loaded === undefined) return undefined;
  return latestSessionNote(loaded);
});

const title = computed(() => {
  const note = latest.value;
  if (note === undefined) return "";
  // A note can genuinely be saved with no title; "Untitled" is what the notes
  // list calls that, and the two surfaces should not disagree.
  return note.title === "" ? "Untitled" : note.title;
});

/** The real-world date the session was played, when the DM recorded one. */
const playedOn = computed<string | null>(() => {
  const raw = latest.value?.session_real_date;
  if (raw === null || raw === undefined) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

const preview = computed(() => extractTiptapText(latest.value?.content, 260));
</script>
