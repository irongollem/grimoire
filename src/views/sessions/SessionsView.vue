<template>
  <PageHeader title="Sessions" description="Every evening at the table, and what was written about it.">
    <template #actions>
      <AppButton variant="outline" size="sm" label="Add a past session" @click="pastOpen = true" />
    </template>

    <div class="space-y-4">
      <SessionRunningCard
        v-if="running"
        class="md:hidden"
        :session="running"
        :pending="pending"
        @end="endSession"
      />

      <p v-if="log && log.length > 0" class="text-caption text-muted-foreground">
        <template v-for="(part, index) in summary" :key="part">
          <span v-if="index > 0" aria-hidden="true"> · </span>
          <span :class="index > 0 && 'text-tone-caution'">{{ index > 0 ? "◆ " : "" }}{{ part }}</span>
        </template>
        <template v-if="(unsorted ?? 0) > 0">
          <span aria-hidden="true"> · </span>
          <RouterLink to="/sessions/unsorted" class="font-semibold text-primary hover:underline">Sort them</RouterLink>
        </template>
      </p>

      <p v-for="group in shared" :key="group.number" class="text-caption text-muted-foreground">
        <span class="text-tone-caution">◆ Session {{ group.number }} is in the log {{ timesWord(group) }}</span>
        <span aria-hidden="true"> · </span>
        <AppButton
          variant="link"
          size="inline-caption"
          class="font-semibold"
          :label="group.absorb.length === 1 ? 'Merge them' : 'Merge them into one'"
          :disabled="merging.isPending.value"
          @click="mergeShared(group)"
        />
      </p>

      <div v-if="isLoading" class="flex justify-center py-10"><LoadingSpinner /></div>
      <p v-else-if="error" role="alert" class="text-body text-destructive">
        The session log could not be read: {{ error.message }}
      </p>
      <div v-else-if="!log || log.length === 0" class="rounded-lg border bg-card px-4 py-10 text-center">
        <p class="text-body italic text-muted-foreground">
          No sessions yet. Start one from the top bar, or add one you played before the log began.
        </p>
      </div>
      <ul v-else class="divide-y divide-border overflow-hidden rounded-lg border bg-card">
        <SessionLogRow
          v-for="row in log"
          :key="row.id"
          :class="running?.id === row.id && 'max-md:hidden'"
          :session="row"
          :facts="factsFor(row.id)"
          :has-note="noteIds.has(row.id)"
          @write="writeNotes(row)"
          @end="endSession"
          @number="(value) => numberIt(row, value)"
          @delete="remove(row)"
        />
      </ul>
    </div>
  </PageHeader>

  <PastSessionDialog
    v-model:open="pastOpen"
    :suggested-number="nextSessionNumber(log ?? [])"
    :pending="adding.isPending.value"
    @confirm="addPast"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SessionLogRow from "@/components/sessions/SessionLogRow.vue";
import SessionRunningCard from "@/components/sessions/SessionRunningCard.vue";
import PastSessionDialog from "@/components/sessions/PastSessionDialog.vue";
import {
  useCampaignSessions,
  useCreatePastSession,
  useDeleteCampaignSession,
  useMergeCampaignSessions,
  useUpdateCampaignSession,
  type PastSessionInput,
} from "@/composables/sessions/useCampaignSessions";
import { useSessionActions } from "@/composables/sessions/useSessionActions";
import { useSessionFacts, useUnsortedCount } from "@/composables/sessions/useSessionFacts";
import { useNotes } from "@/composables/notes/useNotes";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import { nextSessionNumber } from "@/lib/sessions/sessionPrefill";
import {
  isRunningSession,
  logSummaryParts,
  sessionsSharingANumber,
  sessionsWithoutNotes,
  type SessionFacts,
  type SharedNumber,
} from "@/lib/sessions/sessionLog";
import { sessionNoteRoute } from "@/lib/sessions/sessionRoutes";
import type { CampaignSession } from "@/types/session.types";

const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();

const { data: log, isLoading, error } = useCampaignSessions();
const { data: notes } = useNotes();
const { data: unsorted } = useUnsortedCount();
const facts = useSessionFacts();
const { pending, endSession } = useSessionActions();
const update = useUpdateCampaignSession();
const remove_ = useDeleteCampaignSession();
const adding = useCreatePastSession();
const merging = useMergeCampaignSessions();

const pastOpen = ref(false);

const running = computed(() => (log.value ?? []).find(isRunningSession) ?? null);
const noteIds = computed(() => new Set((notes.value ?? []).flatMap((n) => (n.session_id ? [n.session_id] : []))));
const summary = computed(() =>
  logSummaryParts(log.value?.length ?? 0, sessionsWithoutNotes(log.value ?? [], noteIds.value).length, unsorted.value ?? 0),
);

const shared = computed(() => sessionsSharingANumber(log.value ?? []));

/** "twice", "3 times": how often one number appears in the log. */
function timesWord(group: SharedNumber): string {
  const n = group.absorb.length + 1;
  return n === 2 ? "twice" : `${n} times`;
}

/**
 * Merges every row sharing a number into the one that was run, after a confirm.
 * One evening logged twice (run, and written up from its note) is the usual
 * reason; the confirm says what happens so a DM with two genuinely different
 * sessions under one number can decline and renumber instead.
 */
async function mergeShared(group: SharedNumber) {
  const ok = await confirm(
    "They become one session: the time it ran, its encounters, the title, the notes and everything the party learned. " +
      "If they are different evenings, cancel and give one of them another number.",
    { title: `Merge the Session ${group.number} entries?`, confirmLabel: "Merge" },
  );
  if (!ok) return;
  try {
    for (const row of group.absorb) {
      await merging.mutateAsync({ keepId: group.keep.id, absorbId: row.id });
    }
    toast.success(`Session ${group.number} is one entry again.`);
  } catch (cause) {
    toast.error(toast.fromError(cause));
  }
}

const NO_FACTS: SessionFacts = { people: 0, encounters: 0 };
function factsFor(id: string): SessionFacts {
  return facts.value.get(id) ?? NO_FACTS;
}

function writeNotes(row: CampaignSession) {
  void router.push(sessionNoteRoute(row.id));
}

async function numberIt(row: CampaignSession, value: number) {
  try {
    await update.mutateAsync({ id: row.id, update: { number: value } });
  } catch (cause) {
    toast.error(toast.fromError(cause));
  }
}

async function remove(row: CampaignSession) {
  const ok = await confirm(
    "Its note stays, without a session. What the party learned stays learned.",
    { title: `Delete ${sessionLabel(row)}?`, confirmLabel: "Delete session" },
  );
  if (!ok) return;
  try {
    await remove_.mutateAsync(row.id);
  } catch (cause) {
    toast.error(toast.fromError(cause));
  }
}

async function addPast(input: PastSessionInput) {
  try {
    await adding.mutateAsync(input);
    pastOpen.value = false;
  } catch (cause) {
    toast.error(toast.fromError(cause));
  }
}
</script>
