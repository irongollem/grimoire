<template>
  <div v-if="hasAny" class="relative z-10 flex min-w-0 flex-col gap-1.5 md:col-span-3" data-testid="session-chronicle">
    <p v-if="excerpt" class="m-0 text-body text-foreground" data-testid="chronicle-excerpt">{{ excerpt }}</p>
    <p v-if="note" class="m-0 flex flex-wrap gap-x-3 text-label">
      <span v-if="worldDate" class="text-muted-foreground" data-testid="chronicle-world-date">In the world: {{ worldDate }}</span>
      <span :class="shared ? 'font-semibold text-tone-success' : 'text-muted-foreground'" data-testid="chronicle-shared">{{ shared ?? "Not shared yet" }}</span>
    </p>
    <SessionChronicleLearned :session-id="session.id" />
    <SessionChronicleCanon v-if="canon.total > 0" :canon="canon" />
  </div>
</template>

<script setup lang="ts">
/**
 * What a session's log entry says about the evening, under its row or card (frame 12): the chronicle excerpt, its date
 * in the world and who the note is shared with, what the party learned, and what the canon did. A session with no note
 * says nothing here; its Write notes and Draft buttons are the row's own controls.
 */
import { computed } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useSessionCanon } from "@/composables/canon/useSessionCanon";
import { useSessionLearned } from "@/composables/sessions/useSessionLearned";
import { chronicleExcerpt, sessionWorldDate } from "@/lib/canon/canonChronicle";
import { worldDateLabel } from "@/lib/canon/canonLore";
import { audienceLabel } from "@/lib/sessions/learned";
import { useCalendarStore } from "@/stores/calendar";
import type { Note } from "@/types/notes.types";
import type { CampaignSession } from "@/types/session.types";
import SessionChronicleCanon from "./SessionChronicleCanon.vue";
import SessionChronicleLearned from "./SessionChronicleLearned.vue";

const { session, note } = defineProps<{ session: CampaignSession; note: Note | null }>();

const { data: party } = useParty();
const calendar = useCalendarStore();
const canonBySession = useSessionCanon();
const { entries: learned } = useSessionLearned(() => session.id);

const canon = computed(() => canonBySession.value(session));
const excerpt = computed(() => chronicleExcerpt(note?.content ?? null));
const worldDate = computed(() => worldDateLabel(sessionWorldDate(note), (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f)));
// Null when nobody is named, which the template words as "Not shared yet".
const shared = computed(() => (note ? audienceLabel(note.player_visible_to, party.value ?? []) || null : null));
const hasAny = computed(() => note !== null || learned.value.length > 0 || canon.value.total > 0);
</script>
