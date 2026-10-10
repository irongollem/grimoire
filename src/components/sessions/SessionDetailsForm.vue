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
    <!-- A session logged after the fact dates by the day the DM gives it, so
         that day is theirs to correct. A run session dates by its own clock. -->
    <div v-if="loggedByHand" class="space-y-1.5">
      <label for="session-played-on" class="text-label-lg font-semibold text-foreground">Played on</label>
      <VueDatePicker
        v-model="draft.playedOn"
        :input-attrs="{ id: 'session-played-on', clearable: false }"
        :time-config="{ enableTimePicker: false }"
        :teleport="true"
        model-type="yyyy-MM-dd"
        :formats="{ input: 'yyyy-MM-dd' }"
        placeholder="Pick a day…"
        class="grimoire-datepicker w-fit"
      />
    </div>
    <AutosaveStatus :status="status" :error="saveError" />

    <p v-if="!loggedByHand" class="text-body text-foreground">
      <span class="text-muted-foreground">Played:</span> {{ playedLine }}
    </p>
    <p v-if="scheduledAs" class="text-body text-foreground">
      <span class="text-muted-foreground">Scheduled as:</span> {{ scheduledAs.title }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import "@/assets/vendor/datepicker.css";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { useUpdateCampaignSession } from "@/composables/sessions/useCampaignSessions";
import { useSessionProposals } from "@/composables/calendar/useScheduling";
import { useAutosave } from "@/composables/useAutosave";
import { sessionPlayedLine } from "@/lib/sessions/sessionLog";
import type { CampaignSession } from "@/types/session.types";

/**
 * A session's number, title and (for one never run through Start) the day it
 * was played, which save themselves. The page keys this
 * component on the session id, so another session is a fresh draft and the
 * unmount flush writes the old one first.
 */
const { session } = defineProps<{ session: CampaignSession }>();

interface Draft {
  number: number | null;
  title: string;
  /** "YYYY-MM-DD"; null only for a hand-logged session that never had a day. */
  playedOn: string | null;
}

const update = useUpdateCampaignSession();
const { data: proposals } = useSessionProposals();

const initial = (): Draft => ({ number: session.number, title: session.title ?? "", playedOn: session.played_on });
const draft = reactive<Draft>(initial());
const sessionId = session.id;
const loggedByHand = session.started_at === null;

const { status, saveError } = useAutosave({
  draft,
  initial,
  equal: (a, b) => a.number === b.number && a.title === b.title && a.playedOn === b.playedOn,
  async save(snapshot) {
    await update.mutateAsync({
      id: sessionId,
      update: {
        number: snapshot.number,
        title: snapshot.title.trim() || null,
        // A run session's day is its started_at; only a hand-logged one carries played_on.
        ...(loggedByHand && snapshot.playedOn !== null ? { played_on: snapshot.playedOn } : {}),
      },
    });
  },
  errorMessage: "The session could not be saved",
});

const playedLine = computed(() => sessionPlayedLine(session));
const scheduledAs = computed(() => (proposals.value ?? []).find((p) => p.session_id === session.id) ?? null);
</script>
