<template>
  <div
    class="relative flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
  >
    <div class="flex flex-wrap items-baseline gap-x-2">
      <p v-if="session.number !== null" class="log-rubric">Session {{ session.number }}</p>
      <p v-else class="text-label-lg italic text-muted-foreground">No number</p>
      <p class="text-caption text-muted-foreground">{{ dateLine }}</p>
    </div>

    <div class="min-w-0">
      <RouterLink
        :to="`/sessions/${session.id}`"
        class="block truncate text-heading-xs font-semibold text-foreground after:absolute after:inset-0 hover:text-primary"
      >
        {{ title }}
      </RouterLink>
      <p v-if="meta" class="text-caption text-muted-foreground">{{ meta }}</p>
    </div>

    <div class="relative z-10 mt-auto flex flex-wrap items-center gap-2 pt-1">
      <SessionLogActions
        :session="session"
        :has-note="hasNote"
        @write="emit('write')"
        @end="emit('end')"
        @number="(value) => emit('number', value)"
        @delete="emit('delete')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A session in the log as a card, the grid counterpart to `SessionLogRow`: the
 * same rubric, date, title link and controls, stacked. A session has no
 * picture, so this is a text card (the title link covers it, the controls sit
 * above the link).
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import SessionLogActions from "@/components/sessions/SessionLogActions.vue";
import { sessionMeta, sessionShortDate, type SessionFacts } from "@/lib/sessions/sessionLog";
import type { CampaignSession } from "@/types/session.types";

const { session, facts } = defineProps<{
  session: CampaignSession;
  facts: SessionFacts;
  hasNote: boolean;
}>();

const emit = defineEmits<{
  write: [];
  end: [];
  delete: [];
  number: [value: number];
}>();

const dateLine = computed(() => sessionShortDate(session));
const meta = computed(() => sessionMeta(session, facts));
const title = computed(
  () => session.title?.trim() || (session.number === null ? "Untitled session" : `Session ${session.number}`),
);
</script>

<style scoped>
/* Cinzel by name, as the row's rubric: Vellum repaints font-cinzel as Alegreya,
   and a rubric is display type. */
.log-rubric {
  margin: 0;
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--live-ink, var(--primary));
}
</style>
