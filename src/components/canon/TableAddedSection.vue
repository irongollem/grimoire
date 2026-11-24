<template>
  <section id="canon-table" class="flex flex-col gap-3" aria-label="What the table added">
    <div class="flex flex-wrap items-center gap-3">
      <SegmentedControl v-if="hasFacts" v-model="ui.tableFactFilter" :options="FACT_FILTER_OPTIONS" size="sm" aria-label="Show" />
      <AppButton v-if="hasFacts && ui.tableFactsHasActiveFilters" variant="ghost" size="sm" label="Clear" @click="ui.resetTableFactFilters()" />
    </div>
    <p class="m-0 text-caption text-muted-foreground">Everything the Narrator made up and put on record, newest first. Until you strike it, it is true at the table.</p>
    <p v-if="tableOpen" class="m-0 text-caption text-muted-foreground" data-testid="table-story-link">
      <AppButton to="/table/story" variant="link" size="inline" label="Add a fact of your own, or reveal one, on the table's story record." />
    </p>

    <ListSkeleton v-if="record.facts.isLoading.value" variant="rows" :count="3" />
    <p v-else-if="record.facts.isError.value" role="alert" class="text-body text-destructive">Could not load what the table added.</p>
    <template v-else>
      <div v-for="group in groups" :key="group.key ?? 'outside'" class="flex flex-col gap-1.5" :aria-label="group.label" data-testid="table-group">
        <span class="text-eyebrow text-muted-foreground">{{ group.label }}<template v-if="group.date"> · {{ dayOf(group.date) }}</template></span>
        <ul class="m-0 flex list-none flex-col border border-border bg-card p-0">
          <TableFactRow
            v-for="entry in group.entries"
            :key="entry.fact.id"
            :fact="entry.fact"
            :review="factReview(entry.fact, entry.closed)"
            :about="aboutFor(entry.fact.id)"
            :truth-id="truthOf.get(entry.fact.id) ?? null"
            @keep="keep(entry.fact)"
            @edit="correcting = entry.fact"
            @strike="strike(entry.fact)"
            @undo="undo(entry.fact)"
            @truth="makeTruth(entry.fact)"
          />
        </ul>
      </div>
      <EmptyState v-if="groups.length === 0" class="border border-dashed border-border bg-card" :title="empty.title" :description="empty.description" />
    </template>

    <SoloCorrectDialog :fact="correcting" :saving="writes.correct.isPending.value" @close="correcting = null" @save="saveCorrection" />
  </section>
</template>

<script setup lang="ts">
/**
 * "✦ What the table added" (frame 03): the facts the AI table invented, for the DM to review. The default view is
 * what is new; a line the DM has just acted on stays on screen under every filter until the page is left, so a Strike
 * can be undone and a Keep can be seen to have landed.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import SoloCorrectDialog from "@/components/table/solo/SoloCorrectDialog.vue";
import { useFactReview } from "@/composables/canon/useFactReview";
import { useTableFacts } from "@/composables/canon/useTableFacts";
import { useTableAccess } from "@/composables/campaign/useTableAccess";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useFactAbout } from "@/composables/table/useFactAbout";
import { useToast } from "@/composables/useToast";
import type { SittingInfo, StoryFact } from "@/lib/table/solo/storyRecord";
import { useCanonUiStore } from "@/stores/ui/canon";
import type { CanonEntry } from "@/types/canon.types";
import TableFactRow from "./TableFactRow.vue";
import { FACT_FILTER_OPTIONS, factReview, isAlreadyATruth, tableGroups, truthByFact, type FactFilter } from "@/lib/canon/canonTableFacts";

const { truths } = defineProps<{
  /** The campaign's truths: how many there are sets the next one's place, and which carry a fact's id says which facts are already one. */
  truths: readonly CanonEntry[];
}>();

const ui = useCanonUiStore();
const toast = useToast();
const record = useTableFacts();
const { writes, touched, act, keep, strike, undo } = useFactReview();
const { open: tableOpen } = useTableAccess();
const truthOf = computed(() => truthByFact(truths));
const aboutFor = useFactAbout(() => record.links.data.value ?? []);

const sessionLog = useCampaignSessions();
const sittings = computed(() => new Map<string, SittingInfo>((sessionLog.data.value ?? []).map((s) => [s.id, s])));

const groups = computed(() => tableGroups(record.facts.data.value ?? [], sittings.value, ui.tableFactFilter, touched));

const EMPTY: Record<FactFilter, { title: string; description: string }> = {
  new: { title: "Nothing new", description: "Everything the Narrator made up has been reviewed. What it invents next lands here." },
  kept: { title: "Nothing kept yet", description: "A line you keep stays true and is no longer new." },
  struck: { title: "Nothing struck", description: "A line you strike never happened: players and the Narrator stop reading it." },
  all: { title: "The table has added nothing", description: "When the Narrator invents a fact at the AI table, it is filed here for you to keep, edit or strike." },
};
// With nothing on record there is nothing to filter, and "Nothing new" would claim a review that never happened.
const hasFacts = computed(() => (record.facts.data.value ?? []).length > 0);
const empty = computed(() => EMPTY[hasFacts.value ? ui.tableFactFilter : "all"]);

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const makeTruth = (fact: StoryFact) =>
  act(
    fact,
    () => writes.makeTruth.mutateAsync({ fact, sortOrder: truths.length }),
    // Two tabs made it at once: the database keeps the first truth and refuses the second, and nothing else changes.
    (e) => (isAlreadyATruth(e) ? "That line is already a truth." : "That could not be made a truth."),
    () => toast.success("Filed as a truth, and kept."),
  );

const correcting = ref<StoryFact | null>(null);

async function saveCorrection(original: StoryFact, typed: string): Promise<void> {
  await act(original, () => writes.correct.mutateAsync({ original, typed }), "The correction could not be saved.", () => {
    correcting.value = null;
    toast.success("Your version is on record. The old sentence stays, struck through.");
  });
}
</script>
