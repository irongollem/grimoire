<template>
  <PageHeader title="The story so far" description="What is true in this campaign, filed as it happened. Nothing on it is rewritten: a correction is added after what it overtakes.">
    <div class="px-4 pb-8 pt-4 md:px-6" data-testid="table-story">
      <div class="flex max-w-3xl flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <AppButton :to="backTo" variant="ghost" size="md" :icon="IconChevronLeft" :label="asPlayer ? 'Back to the story' : 'Back to the table'" />
        </div>

        <SoloRecordAdd v-if="canWrite && !asPlayer" :saving="writes.add.isPending.value" @add="addFact" />

        <ListSkeleton v-if="isLoading" variant="stack" :count="4" />
        <p v-else-if="isError" role="alert" class="text-body text-destructive">The record could not be read. Reload to try again.</p>
        <p v-else-if="!facts.length" class="text-body italic text-muted-foreground" data-testid="record-empty">
          Nothing is on record yet. Facts the story settles (who holds the key, what burned, what is owed) are kept here as they happen.
        </p>
        <template v-else>
          <div class="flex items-center gap-2">
            <AppInput v-model="ui.storyRecordSearch" type="search" size="md" block placeholder="Search the record" aria-label="Search the record" />
            <AppButton v-if="ui.storyRecordHasActiveFilters" variant="ghost" size="md" label="Clear" @click="ui.resetStoryRecordFilters()" />
          </div>
          <p v-if="!groups.length" class="text-body italic text-muted-foreground">Nothing on record matches that.</p>
          <section v-for="group in groups" :key="group.key ?? 'outside'" class="flex flex-col gap-1" :aria-label="group.label" data-testid="record-group">
            <h2 class="flex flex-wrap items-baseline gap-x-2 text-heading-sm text-foreground">
              {{ group.label }}
              <span v-if="group.date" class="text-caption font-normal text-muted-foreground">{{ dayOf(group.date) }}</span>
            </h2>
            <ul class="flex flex-col divide-y divide-border border-y border-border">
              <SoloRecordFact
                v-for="entry in group.entries"
                :key="entry.fact.id"
                :fact="entry.fact"
                :closed="entry.closed"
                :about="aboutFor(entry.fact.id)"
                :can-write="canWrite"
                :can-review="canReview && entry.fact.source === 'table'"
                @correct="correcting = $event"
                @reveal="reveal"
                @keep="keep"
                @strike="strike"
                @undo="undo"
              />
            </ul>
          </section>
        </template>
      </div>
    </div>

    <SoloCorrectDialog :fact="correcting" :saving="writes.correct.isPending.value" @close="correcting = null" @save="saveCorrection" />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import PageHeader from "@/components/common/list/PageHeader.vue";
import SoloCorrectDialog from "@/components/table/solo/SoloCorrectDialog.vue";
import SoloRecordAdd from "@/components/table/solo/SoloRecordAdd.vue";
import SoloRecordFact from "@/components/table/solo/SoloRecordFact.vue";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useFactReview } from "@/composables/canon/useFactReview";
import { useFactAbout } from "@/composables/table/useFactAbout";
import { useStoryRecord } from "@/composables/table/useStoryRecord";
import { useStoryRecordWrites } from "@/composables/table/useStoryRecordWrites";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconChevronLeft } from "@/lib/icons";
import { groupRecord, type SittingInfo, type StoryFact } from "@/lib/table/solo/storyRecord";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { useTableUiStore } from "@/stores/ui/table";

const auth = useAuthStore();
const ui = useTableUiStore();
const toast = useToast();
const { confirm } = useConfirm();
const writes = useStoryRecordWrites();
// Keep and Strike are the Canon page's own writes: a DM reviewing here can do what the Canon page offers.
const { keep, strike, undo } = useFactReview();

// Whoever may write the record. The database decides who truly can; this only decides what is offered.
const canWrite = computed(() => auth.isDM);

// At the table the reader is a player: the account is the DM's, so the database returns every fact, and this is
// the one place that keeps what the party has not learned off the page. No Reveal and no hand-filed facts there
// either (those are the Dungeon Master's); a correction stays, since the story is the player's to set right.
const appUi = useAppUiStore();
const asPlayer = computed(() => appUi.tablePlay !== null);
// The review of what the table added is the DM's, never offered from a played seat.
const canReview = computed(() => canWrite.value && !asPlayer.value);
const backTo = computed(() => {
  const play = appUi.tablePlay;
  return play === null ? "/table" : `/play/table/${play.sessionId ?? "new"}`;
});

const record = useStoryRecord();
const facts = computed(() => (record.facts.data.value ?? []).filter((fact) => !asPlayer.value || (fact.known_to_player && fact.struck_at === null)));
const isLoading = computed(() => record.facts.isLoading.value);
const isError = computed(() => record.facts.isError.value);

// Sittings are the DM's log; a player reads none, and their facts group by the day they were filed instead.
const sessionLog = useCampaignSessions({ enabled: () => canWrite.value });
const sittings = computed(
  () => new Map<string, SittingInfo>((sessionLog.data.value ?? []).map((s) => [s.id, s])),
);
const groups = computed(() => groupRecord(facts.value, sittings.value, ui.storyRecordSearch));

const aboutFor = useFactAbout(() => record.links.data.value ?? []);

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const correcting = ref<StoryFact | null>(null);

async function saveCorrection(original: StoryFact, typed: string): Promise<void> {
  try {
    await writes.correct.mutateAsync({ original, typed });
    correcting.value = null;
    toast.success("Correction added. The old sentence stays on record, struck through.");
  } catch (e) {
    toast.error(toast.fromError(e, "The correction could not be saved."));
  }
}

async function addFact(typed: string, hidden: boolean, done: () => void): Promise<void> {
  try {
    await writes.add.mutateAsync({ typed, hidden });
    done();
  } catch (e) {
    toast.error(toast.fromError(e, "That could not be put on the record."));
  }
}

async function reveal(fact: StoryFact): Promise<void> {
  const ok = await confirm("Once the party knows this it cannot be hidden again, and players will read it on their page.", {
    title: "Tell the party?",
    confirmLabel: "Reveal",
    danger: false,
  });
  if (!ok) return;
  try {
    await writes.reveal.mutateAsync(fact.id);
  } catch (e) {
    toast.error(toast.fromError(e, "That could not be revealed."));
  }
}
</script>
