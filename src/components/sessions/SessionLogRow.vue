<template>
  <div class="relative grid gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 md:grid-cols-[9.5rem_minmax(0,1fr)_auto] md:items-center">
    <SessionLogRubric class="md:block" :session="session" />

    <div class="min-w-0">
      <RouterLink
        :to="`/sessions/${session.id}`"
        class="block truncate text-heading-xs font-semibold text-foreground after:absolute after:inset-0 hover:text-primary"
      >
        {{ title }}
      </RouterLink>
      <p v-if="meta" class="text-caption text-muted-foreground">{{ meta }}</p>
    </div>

    <div class="relative z-10 flex flex-wrap items-center gap-2 md:justify-end">
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
