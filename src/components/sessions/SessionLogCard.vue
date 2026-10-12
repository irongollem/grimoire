<template>
  <div
    class="relative flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
  >
    <SessionLogRubric :session="session" />

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
import SessionLogRubric from "@/components/sessions/SessionLogRubric.vue";
import { sessionMeta, sessionTitle, type SessionFacts } from "@/lib/sessions/sessionLog";
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

const meta = computed(() => sessionMeta(session, facts));
const title = computed(() => sessionTitle(session));
</script>
