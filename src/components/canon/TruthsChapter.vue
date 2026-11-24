<template>
  <CanonChapter chapter="truths" :title="chapter.label" :why="chapter.why" :open="selected !== null" :back-label="chapter.label" @close="emit('close')">
    <template #toolbar>
      <CanonReview mode="truths" :entries="allTruths" />
      <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>

      <div v-if="unreviewed > 0" class="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2" data-testid="table-inbox">
        <span class="min-w-0 flex-1 text-body">{{ unreviewed }} {{ unreviewed === 1 ? "line" : "lines" }} from the table to keep or strike</span>
        <AppButton variant="outline" size="sm" label="Review" data-testid="table-review" @click="reviewing = true" />
      </div>

      <div v-if="truths.length > 0" class="flex flex-wrap items-center gap-2" data-testid="truth-toolbar">
        <SegmentedControl v-model="store.truthFilter" :options="TRUTH_FILTER_OPTIONS" wrap class="shrink-0" aria-label="Show truths by mark" />
        <AppButton
          variant="chip"
          size="sm"
          label="Group by what it is about"
          :active="store.truthsGrouped"
          :aria-pressed="store.truthsGrouped"
          data-testid="truth-group-toggle"
          @click="store.truthsGrouped = !store.truthsGrouped"
        />
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
            :move="canReorder ? endsOf(shown, truth.id) : null"
            @select="emit('select', truth.id)"
            @move="(direction) => reorder(shown, truth.id, direction)"
          >
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

  <AppModal :open="reviewing" size="lg" @close="reviewing = false">
    <ModalHeader title="What the table added" closeable @close="reviewing = false" />
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <TableAddedSection :truths="allTruths" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The Truths chapter: every truth with its mark and, for "known to some", the people and factions that know it; a truth
 * is always made with a mark, so the add row asks for one beside the words. The list filters by mark (or to the truths
 * of no arc) and groups by the record each truth is about. The lines the table invented arrive here as an inbox above
 * the list, reviewed in a modal, because a line kept becomes one of these truths.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
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
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
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

const tableRecord = useTableFacts();
const unreviewed = computed(() => unreviewedCount(tableRecord.facts.data.value ?? []));
const reviewing = ref(false);

const draft = ref("");
const mark = ref<KnowledgeMark>("all");
const { mutateAsync: create } = useCreateCanonEntry();

async function addTruth(title: string) {
  const created = await create({ part: "truth", knowledge: mark.value, title, sort_order: allTruths.length });
  emit("select", created.id);
}
</script>
