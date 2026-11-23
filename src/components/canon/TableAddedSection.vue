<template>
  <section id="canon-table" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-table-heading">
    <div class="flex flex-wrap items-center gap-3">
      <CanonRubric id="canon-table-heading" class="min-w-0 flex-1" numeral="✦" title="What the table added" />
      <SegmentedControl v-if="hasFacts" v-model="ui.tableFactFilter" :options="FACT_FILTER_OPTIONS" size="sm" aria-label="Show" />
      <AppButton v-if="hasFacts && ui.tableFactsHasActiveFilters" variant="ghost" size="sm" label="Clear" @click="ui.resetTableFactFilters()" />
    </div>
    <p class="m-0 text-caption text-muted-foreground">Everything the Narrator made up and put on record, newest first. Until you strike it, it is true at the table.</p>

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
import { computed, reactive, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import SoloCorrectDialog from "@/components/table/solo/SoloCorrectDialog.vue";
import { useTableFacts, useTableFactWrites } from "@/composables/canon/useTableFacts";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useFactAbout } from "@/composables/table/useFactAbout";
import { useToast } from "@/composables/useToast";
import type { SittingInfo, StoryFact } from "@/lib/table/solo/storyRecord";
import { useCanonUiStore } from "@/stores/ui/canon";
import CanonRubric from "./CanonRubric.vue";
import TableFactRow from "./TableFactRow.vue";
import { FACT_FILTER_OPTIONS, factReview, tableGroups, type FactFilter } from "@/lib/canon/canonTableFacts";

const { truthCount } = defineProps<{ truthCount: number }>();

const ui = useCanonUiStore();
const toast = useToast();
const record = useTableFacts();
const writes = useTableFactWrites();
const aboutFor = useFactAbout(() => record.links.data.value ?? []);

const sessionLog = useCampaignSessions();
const sittings = computed(() => new Map<string, SittingInfo>((sessionLog.data.value ?? []).map((s) => [s.id, s])));

// Facts acted on this visit stay listed; for a strike, what the keep was before it, so Undo gives it back.
const touched = reactive(new Set<string>());
const keptBeforeStrike = new Map<string, string | null>();

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

async function act(fact: StoryFact, run: () => Promise<unknown>, failure: string, done?: () => void): Promise<void> {
  // Listed before the write settles: the refresh that follows it would otherwise drop the line from this filter for a moment.
  const wasListed = touched.has(fact.id);
  touched.add(fact.id);
  try {
    await run();
    done?.();
  } catch (e) {
    if (!wasListed) touched.delete(fact.id);
    toast.error(toast.fromError(e, failure));
  }
}

const keep = (fact: StoryFact) => act(fact, () => writes.keep.mutateAsync(fact), "That could not be kept.");

const strike = (fact: StoryFact) =>
  act(fact, () => writes.strike.mutateAsync(fact), "That could not be struck.", () => keptBeforeStrike.set(fact.id, fact.kept_at));

const undo = (fact: StoryFact) =>
  act(fact, () => writes.undoStrike.mutateAsync({ fact, previousKeptAt: keptBeforeStrike.get(fact.id) ?? null }), "That could not be undone.");

const makeTruth = (fact: StoryFact) =>
  act(fact, () => writes.makeTruth.mutateAsync({ fact, sortOrder: truthCount }), "That could not be made a truth.", () => toast.success("Filed as a truth, and kept."));

const correcting = ref<StoryFact | null>(null);

async function saveCorrection(original: StoryFact, typed: string): Promise<void> {
  await act(original, () => writes.correct.mutateAsync({ original, typed }), "The correction could not be saved.", () => {
    correcting.value = null;
    toast.success("Your version is on record. The old sentence stays, struck through.");
  });
}
</script>
