<template>
  <DashboardWidget
    title="Sessions"
    to="/sessions"
    action-label="The log →"
    :loading="log === undefined"
    max-height="none"
  >
    <div class="divide-y">
      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <div class="min-w-0">
          <p class="widget-rubric">Next</p>
          <template v-if="running">
            <p class="truncate text-heading-xs font-semibold text-foreground">
              {{ sessionShortLabel(running) }} · {{ elapsed }}
            </p>
          </template>
          <template v-else-if="next">
            <p class="truncate text-heading-xs font-semibold text-foreground">{{ next.title }}</p>
            <p class="text-caption text-muted-foreground">{{ nextWhen }}</p>
          </template>
          <p v-else class="text-body italic text-muted-foreground">No date on the calendar yet.</p>
        </div>
        <AppButton v-if="running" variant="outline" size="sm" label="End" :disabled="pending" @click="endSession" />
        <AppButton v-else variant="live" size="sm" :disabled="pending" :label="startLabel" @click="startOpen = true" />
      </div>

      <div v-if="last" class="px-4 py-3">
        <p class="widget-rubric">Last time</p>
        <RouterLink :to="`/sessions/${last.id}`" class="block hover:text-primary">
          <p class="truncate text-heading-xs font-semibold text-foreground">{{ sessionLabel(last) }}</p>
        </RouterLink>
        <p v-if="lastRecap" class="text-caption text-muted-foreground line-clamp-3">{{ lastRecap }}</p>
        <p v-else class="text-caption italic text-muted-foreground">No recap written.</p>
      </div>

      <ul v-if="gaps.length > 0 || (unsorted ?? 0) > 0" class="space-y-1.5 px-4 py-3">
        <li v-for="gap in gaps" :key="gap.id" class="flex items-baseline justify-between gap-2 text-body">
          <span class="min-w-0 truncate"><span class="text-tone-caution">◆</span> {{ sessionShortLabel(gap) }} has no notes yet</span>
          <AppButton :to="sessionNoteRoute(gap.id)" variant="link" size="inline-xs" label="Write" />
        </li>
        <li v-if="(unsorted ?? 0) > 0" class="flex items-baseline justify-between gap-2 text-body">
          <span class="min-w-0 truncate">
            <span class="text-tone-caution">◆</span> {{ countOf(unsorted ?? 0, "thing", "things") }} learned outside any session
          </span>
          <AppButton to="/sessions/unsorted" variant="link" size="inline-xs" label="Sort" />
        </li>
      </ul>
    </div>

    <SessionQuickLine v-if="target" :session="target" />
  </DashboardWidget>

  <SessionStartDialog v-model:open="startOpen" :pending="pending" @confirm="confirmStart" />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { useIntervalFn, useNow } from "@vueuse/core";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import SessionQuickLine from "@/components/dashboard/widgets/SessionQuickLine.vue";
import SessionStartDialog from "@/components/layout/SessionStartDialog.vue";
import AppButton from "@/components/common/AppButton.vue";
import { formatSessionElapsed, type StartSessionOptions } from "@/composables/campaign/useCampaignSession";
import { useSessionActions } from "@/composables/sessions/useSessionActions";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useUnsortedCount } from "@/composables/sessions/useSessionFacts";
import { useSessionProposals } from "@/composables/calendar/useScheduling";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { useNotes } from "@/composables/notes/useNotes";
import { pickNextSession, sessionTimeRange } from "@/lib/calendar/nextSession";
import { sessionLabel, sessionShortLabel } from "@/lib/sessions/sessionLabel";
import { lastPlayedSession, nextSessionNumber } from "@/lib/sessions/sessionPrefill";
import {
  countOf,
  isRunningSession,
  quickNoteTarget,
  sessionsWithoutNotes,
} from "@/lib/sessions/sessionLog";
import { sessionNoteRoute } from "@/lib/sessions/sessionRoutes";
import { extractTiptapText } from "@/lib/utils";

/**
 * The Sessions widget (#985), which replaces "Last session". It answers the
 * three questions around a session in one card: what is next (and start it, or
 * end the one running), what happened last time, and which evenings still have
 * no notes. The quick line beneath adds to the running session's note.
 */
const { data: log } = useCampaignSessions();
const { data: notes } = useNotes();
const { data: proposals } = useSessionProposals();
const { data: unsorted } = useUnsortedCount();
const { pending, startSession, endSession } = useSessionActions();
const today = useLocalToday();
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 60_000) });

const startOpen = ref(false);

const running = computed(() => (log.value ?? []).find(isRunningSession) ?? null);
const last = computed(() => lastPlayedSession(log.value ?? []));
const target = computed(() => quickNoteTarget(log.value ?? []));
const next = computed(() => pickNextSession(proposals.value ?? [], today.value));

const noted = computed(() => new Set((notes.value ?? []).flatMap((n) => (n.session_id ? [n.session_id] : []))));
const gaps = computed(() => sessionsWithoutNotes(log.value ?? [], noted.value).slice(0, 2));

const elapsed = computed(() => formatSessionElapsed(running.value?.started_at ?? null, now.value.getTime()));
const startLabel = computed(() => {
  const number = nextSessionNumber(log.value ?? []);
  return number === null ? "Start session" : `Start session ${number}`;
});

const nextWhen = computed(() => {
  const p = next.value;
  if (!p) return "";
  const day = new Date(`${p.proposed_date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = sessionTimeRange(p);
  return time ? `${day} · ${time}` : day;
});

const lastRecap = computed(() => {
  const id = last.value?.id;
  const note = id ? (notes.value ?? []).find((n) => n.session_id === id) : undefined;
  return note ? extractTiptapText(note.content, 220) : "";
});

async function confirmStart(options: StartSessionOptions) {
  startOpen.value = false;
  await startSession(options);
}
</script>

<style scoped>
.widget-rubric {
  margin: 0 0 0.125rem;
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--live-ink, var(--primary));
}
</style>
