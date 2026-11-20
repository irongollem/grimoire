<template>
  <li class="grid gap-3 border-b border-border py-4 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-5" data-testid="chronicle-entry" :data-written="note !== null">
    <div class="flex flex-col gap-0.5 text-body">
      <span class="text-heading-xs text-primary">{{ shortLabel }}</span>
      <span v-if="played" data-testid="chronicle-played">Played {{ played }}</span>
      <span v-if="worldDate" class="text-caption text-muted-foreground" data-testid="chronicle-world-date">In the world: {{ worldDate }}</span>
      <span
        v-if="note"
        class="mt-1 text-label font-semibold"
        :class="shared ? 'text-tone-success' : 'text-muted-foreground'"
        data-testid="chronicle-shared"
      >{{ shared ?? "Not shared yet" }}</span>
    </div>

    <div class="flex min-w-0 flex-col gap-2">
      <template v-if="note">
        <AppButton :to="`/notes/${note.id}`" variant="link" size="inline" class="self-start text-heading-sm" :label="title" />
        <div class="flex items-start gap-3">
          <div v-if="!lowArt && picture" class="h-24 w-36 shrink-0 overflow-hidden bg-muted" data-testid="chronicle-picture">
            <FocalImage :src="picture" alt="" format="landscape" class="size-full" />
          </div>
          <p v-if="excerpt" class="m-0 min-w-0 text-body text-foreground" data-testid="chronicle-excerpt">{{ excerpt }}</p>
          <p v-else class="m-0 text-body italic text-muted-foreground">The note has no words yet.</p>
        </div>
      </template>
      <template v-else>
        <span class="text-heading-sm text-foreground">{{ title }}</span>
        <p class="m-0 text-body italic text-muted-foreground">No chronicle written for this session yet.</p>
        <div class="flex flex-wrap gap-2">
          <AppButton :to="sessionNoteRoute(session.id)" variant="primary" size="sm" label="Write the chronicle" />
          <AppButton :to="sessionNoteRoute(session.id, { chronicler: true })" variant="outline" size="sm" label="Draft with the Chronicler" />
        </div>
      </template>
      <ChronicleLearned :session-id="session.id" />
    </div>
  </li>
</template>

<script setup lang="ts">
/**
 * One session's chronicle entry (frame 12): its number and title, the day it was played, its date in the world, who
 * the note is shared with, and its excerpt with the first picture the Chronicler put in it. A session with no note
 * offers the two ways to start one, the same two the Sessions page offers.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useParty } from "@/composables/party/useParty";
import { useLowArt } from "@/composables/useLowArt";
import { sessionWhen } from "@/lib/sessions/sessionPrefill";
import { sessionLabel, sessionShortLabel } from "@/lib/sessions/sessionLabel";
import { sessionNoteRoute } from "@/lib/sessions/sessionRoutes";
import { audienceLabel } from "@/lib/sessions/learned";
import { useCalendarStore } from "@/stores/calendar";
import ChronicleLearned from "./ChronicleLearned.vue";
import { chronicleExcerpt, firstNoteImage, sessionWorldDate, type ChronicleItem } from "@/lib/canon/canonChronicle";
import { worldDateLabel } from "@/lib/canon/canonLore";

const { session, note } = defineProps<ChronicleItem>();

const { lowArt } = useLowArt();
const { data: party } = useParty();
const calendar = useCalendarStore();

const shortLabel = computed(() => sessionShortLabel(session).replace("No number", "Unnumbered"));
const title = computed(() => note?.title.trim() || session.title?.trim() || sessionLabel(session));
const played = computed(() => new Date(sessionWhen(session)).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
const worldDate = computed(() => worldDateLabel(sessionWorldDate(note), (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f)));
// Null when nobody is named, which the template words as "Not shared yet".
const shared = computed(() => (note ? audienceLabel(note.player_visible_to, party.value ?? []) || null : null));
const excerpt = computed(() => chronicleExcerpt(note?.content ?? null));
const picture = computed(() => firstNoteImage(note?.content ?? null));
</script>
