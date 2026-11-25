<template>
  <CanonChapter chapter="truths" :title="chapter.label" :why="chapter.why" :open="selected !== null" :back-label="chapter.label" @close="emit('close')">
    <template #toolbar>
      <CanonReview mode="truths" :entries="allTruths" />
      <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>

      <div v-if="unreviewed > 0" class="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2" data-testid="table-inbox">
        <span class="min-w-0 flex-1 text-body">{{ unreviewed }} {{ unreviewed === 1 ? "line" : "lines" }} from the table to keep or strike</span>
        <AppButton variant="outline" size="sm" label="Review" data-testid="table-review" @click="reviewing = true" />
      </div>

      <TruthBulkBar
        v-if="bulk.selecting.value"
        :count="bulk.count.value"
        :busy="bulkBusy"
        @select-all="bulk.selectAll(shownIds)"
        @clear="bulk.clear"
        @stop="bulk.stop"
        @file-in-arc="fileSelectionInArc"
        @mark-as="markSelection"
      />
      <div v-if="truths.length > 0" class="flex flex-wrap items-center gap-2" data-testid="truth-toolbar">
        <SegmentedControl v-model="store.truthFilter" :options="TRUTH_FILTER_OPTIONS" wrap class="max-w-full" aria-label="Show truths by mark" />
        <AppButton
          variant="chip"
          size="sm"
          label="Group by what it is about"
          :active="store.truthsGrouped"
          :aria-pressed="store.truthsGrouped"
          data-testid="truth-group-toggle"
          @click="store.truthsGrouped = !store.truthsGrouped"
        />
        <AppButton variant="chip" size="sm" label="Select" :active="bulk.selecting.value" :aria-pressed="bulk.selecting.value" data-testid="truth-select-toggle" @click="toggleSelecting" />
        <AppButton v-if="store.truthsHaveActiveFilters" variant="ghost" size="sm" label="Clear" data-testid="truth-clear" @click="store.resetTruthFilters()" />
      </div>
    </template>

    <template v-if="shown.length > 0">
      <div v-for="group in groups" :key="group.key" class="flex flex-col gap-1.5" :data-testid="store.truthsGrouped ? 'truth-group' : undefined">
        <h3 v-if="store.truthsGrouped" class="m-0 text-eyebrow text-muted-foreground">{{ group.label ?? "Not about anyone in particular" }}</h3>
        <ul class="flex flex-col rounded-lg border border-border bg-card" data-testid="truth-ledger">
          <CanonRow
            v-for="truth in group.truths"
            :id="`canon-entry-${truth.id}`"
            :key="truth.id"
            :title="truth.title"
            :selected="truth.id === selected?.id"
            layout="flex-col gap-1 sm:flex-row sm:items-start sm:gap-3"
            :move="canReorder && !bulk.selecting.value ? endsOf(shown, truth.id, true) : null"
            @select="bulk.selecting.value ? bulk.toggle(truth.id) : emit('select', truth.id)"
            @move="(direction) => reorder(shown, truth.id, direction)"
            @move-to="(end) => reorder(shown, truth.id, end)"
          >
            <template v-if="bulk.selecting.value" #lead>
              <!-- The row's own stretched button toggles it; the box only shows the state. -->
              <AppCheckbox :model-value="bulk.isSelected(truth.id)" class="pointer-events-none mr-3 mt-0.5" :aria-label="`${truth.title} is selected`" tabindex="-1" />
            </template>
            <span v-if="truth.knowledge === 'some'" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted-foreground">
              <template v-if="knowersOf(truth.id).length > 0">
                Known to
                <CanonRef v-for="k in knowersOf(truth.id)" :key="k.rowId" :kind="k.kind" :name="k.name" />
              </template>
              <span v-else data-testid="nobody-named" class="italic">Nobody named yet: say who knows it.</span>
            </span>
            <template #mark><CanonKnowledgeMark v-if="truth.knowledge" :mark="truth.knowledge" /></template>
          </CanonRow>
        </ul>
      </div>
    </template>
    <CanonEmpty v-else-if="truths.length > 0" title="No truth matches" text="No truth has that mark." />
    <CanonEmpty v-else-if="arcLabel !== null" title="No truths in this arc" :text="`Nothing of this chapter is in ${arcLabel}.`" />
    <CanonEmpty v-else title="No truths yet" :text="EMPTY_TEXT" ask="Suggest three truths for my canon." />

    <template #add>
      <CanonAddRow v-model="draft" placeholder="A new truth…" input-label="A new truth" label="Add truth" :create="addTruth">
        <SegmentedControl v-model="mark" :options="MARK_OPTIONS" class="shrink-0" aria-label="Who knows it" />
      </CanonAddRow>
    </template>

    <template #entry>
      <TruthDetail v-if="selected" :key="selected.id" :entry="selected" @close="emit('close')" @delete="emit('delete')" />
    </template>
  </CanonChapter>

  <AppModal :open="reviewing" size="lg" @close="closeReview">
    <ModalHeader title="What the table added" closeable @close="closeReview" />
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <TableAddedSection :truths="allTruths" :focus-fact="focusFact" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The Truths chapter: every truth with its mark and, for "known to some", the people and factions that know it; a truth
 * is always made with a mark, so the add row asks for one beside the words. The list filters by mark (or to the truths
 * of no arc) and groups by the record each truth is about. The lines the table invented arrive here as an inbox above
 * the list, reviewed in a modal, because a line kept becomes one of these truths. Select turns the rows into a selection with a bar to file them in an arc or mark them together.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import TruthBulkBar from "./TruthBulkBar.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonReview from "./CanonReview.vue";
import CanonChapter from "./kit/CanonChapter.vue";
import CanonEmpty from "./kit/CanonEmpty.vue";
import CanonRow from "./kit/CanonRow.vue";
import TableAddedSection from "./TableAddedSection.vue";
import TruthDetail from "./TruthDetail.vue";
import CanonKnowledgeMark from "./CanonKnowledgeMark.vue";
import CanonRef from "./CanonRef.vue";
import { MARK_OPTIONS, chapterOf } from "@/lib/canon/canonParts";
import { unreviewedCount } from "@/lib/canon/canonTableFacts";
import { TRUTH_FILTER_OPTIONS, aboutByTruth, filterTruths, groupTruths } from "@/lib/canon/canonTruthView";
import { endsOf } from "@/lib/canon/canonOrder";
import { useLinkedRow } from "@/composables/canon/useLinkedRow";
import { useBulkSelection } from "@/composables/useBulkSelection";
import { toast } from "@/lib/toast";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useCreateCanonEntry, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useKnowersByEntry, type Knower } from "@/composables/canon/useKnownToByEntry";
import { useTableFacts } from "@/composables/canon/useTableFacts";
import { useWorldTies } from "@/composables/world/useWorldTies";
import type { CanonEntry, KnowledgeMark } from "@/types/canon.types";

const EMPTY_TEXT = 'A truth is something simply so about your world, said in one line: "Magic leaves a taste on the tongue." Write three and the rest of the canon has ground to stand on.';

const { truths, allTruths, selected = null, arcLabel = null } = defineProps<{
  /** The truths of the page's arc (every truth when none is chosen). */
  truths: readonly CanonEntry[];
  /** Every truth of the campaign: the table's review reads which of its lines are already one, whatever arc narrows the list. */
  allTruths: readonly CanonEntry[];
  /** The open truth, read from the whole canon so an arc change does not close it. */
  selected?: CanonEntry | null;
  /** The name of the arc narrowing this chapter, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: string]; close: []; delete: [] }>();

const chapter = chapterOf("truths");

// One read of every tie for the whole list, never one per truth.
const { byEntry } = useKnowersByEntry();
const NO_KNOWERS: readonly Knower[] = [];
const knowersOf = (id: string) => byEntry.value.get(id) ?? NO_KNOWERS;

const store = useCanonUiStore();
const shown = computed(() => filterTruths(truths, store.truthFilter));
// What each truth is about, from the one read of every tie the knowers above already share.
const { data: ties } = useWorldTies();
const groups = computed(() => (store.truthsGrouped ? groupTruths(shown.value, aboutByTruth(ties.value ?? [])) : [{ key: "all", label: null, truths: shown.value }]));
// Moving inside a narrowed, filtered or grouped list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null && store.truthFilter === "any" && !store.truthsGrouped);
const reorder = useCanonReorder();

// Selecting several truths to file in an arc or re-mark together (#1279 item 33). The selection is transient, and is
// pruned to the rows on screen before every write so a truth a filter has hidden is never touched.
const bulk = useBulkSelection();
const shownIds = computed(() => shown.value.map((t) => t.id));
const { mutateAsync: updateEntry } = useUpdateCanonEntry();
const bulkBusy = ref(false);
const toggleSelecting = () => (bulk.selecting.value ? bulk.stop() : (bulk.selecting.value = true));
watch(shownIds, (ids) => bulk.pruneTo(ids));

async function writeSelection(patch: { arc_id: string | null } | { knowledge: KnowledgeMark }, done: (n: number) => string) {
  const ids = bulk.pruneTo(shownIds.value);
  if (ids.length === 0 || bulkBusy.value) return;
  bulkBusy.value = true;
  try {
    // Each failed write has already been toasted by the update mutation.
    const results = await Promise.allSettled(ids.map((id) => updateEntry({ id, patch })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    if (ok > 0) toast.info(done(ok));
    if (ok === ids.length) bulk.stop();
  } finally {
    bulkBusy.value = false;
  }
}
const plural = (n: number) => `${n} ${n === 1 ? "truth" : "truths"}`;
const fileSelectionInArc = (arcId: string | null, name: string) => writeSelection({ arc_id: arcId }, (n) => (arcId === null ? `Took ${plural(n)} out of their arc.` : `Filed ${plural(n)} in ${name}.`));
const markSelection = (mark: KnowledgeMark, label: string) => writeSelection({ knowledge: mark }, (n) => `Marked ${plural(n)}: ${label}.`);

const tableRecord = useTableFacts();
const unreviewed = computed(() => unreviewedCount(tableRecord.facts.data.value ?? []));
const reviewing = ref(false);
// A search hit for a table line lands as `?fact=<id>`: the review opens on that line, ringed. An unknown id opens nothing.
const focusFact = ref<string | null>(null);
const closeReview = () => {
  reviewing.value = false;
  focusFact.value = null;
};
useLinkedRow("fact", (id) => (tableRecord.facts.data.value ?? []).some((f) => f.id === id), (id) => {
  focusFact.value = id;
  reviewing.value = true;
}, null);

const draft = ref("");
const mark = ref<KnowledgeMark>("all");
const { mutateAsync: create } = useCreateCanonEntry();

async function addTruth(title: string) {
  const created = await create({ part: "truth", knowledge: mark.value, title, sort_order: allTruths.length, arc_id: store.arcFilter });
  emit("select", created.id);
}
</script>
