<template>
  <section class="space-y-3">
    <div class="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <div class="space-y-1.5">
        <label for="session-number" class="text-label-lg font-semibold text-foreground">Session number</label>
        <AppInput id="session-number" v-model.number="draft.number" type="number" size="md" placeholder="No number" block />
      </div>
      <div class="space-y-1.5">
        <label for="session-title" class="text-label-lg font-semibold text-foreground">Title</label>
        <AppInput id="session-title" v-model="draft.title" size="md" placeholder="Into the Mere" block />
      </div>
    </div>
    <AutosaveStatus :status="status" :error="saveError" />

    <p class="text-body text-foreground">
      <span class="text-muted-foreground">Played:</span> {{ playedLine }}
    </p>
    <p v-if="scheduledAs" class="text-body text-foreground">
      <span class="text-muted-foreground">Scheduled as:</span> {{ scheduledAs.title }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import AutosaveStatus from "@/components/common/AutosaveStatus.vue";
import { useUpdateCampaignSession } from "@/composables/sessions/useCampaignSessions";
import { useSessionProposals } from "@/composables/calendar/useScheduling";
import { useAutosave } from "@/composables/useAutosave";
import { sessionPlayedLine } from "@/lib/sessions/sessionLog";
import type { CampaignSession } from "@/types/session.types";

/**
 * A session's number and title, which save themselves. The page keys this
 * component on the session id, so another session is a fresh draft and the
 * unmount flush writes the old one first.
 */
const { session } = defineProps<{ session: CampaignSession }>();

interface Draft {
  number: number | null;
  title: string;
}

const update = useUpdateCampaignSession();
const { data: proposals } = useSessionProposals();

const draft = reactive<Draft>({ number: session.number, title: session.title ?? "" });
const sessionId = session.id;

const { status, saveError } = useAutosave({
  draft,
  initial: () => ({ number: session.number, title: session.title ?? "" }),
  equal: (a, b) => a.number === b.number && a.title === b.title,
  async save(snapshot) {
    await update.mutateAsync({
      id: sessionId,
      update: { number: snapshot.number, title: snapshot.title.trim() || null },
    });
  },
  errorMessage: "The session could not be saved",
});

const playedLine = computed(() => sessionPlayedLine(session));
const scheduledAs = computed(() => (proposals.value ?? []).find((p) => p.session_id === session.id) ?? null);
</script>
