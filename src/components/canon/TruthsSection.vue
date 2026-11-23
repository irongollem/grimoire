<template>
  <section id="canon-truths" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-truths-heading">
    <CanonRubric id="canon-truths-heading" numeral="II" title="Truths" />

    <CanonSuggestFold part="truths">
      <CanonSuggestions mode="truths" :entries="truths" />
    </CanonSuggestFold>

    <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>

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

    <template v-if="shown.length > 0">
      <div v-for="group in groups" :key="group.key" class="flex flex-col gap-1.5" :data-testid="store.truthsGrouped ? 'truth-group' : undefined">
        <h3 v-if="store.truthsGrouped" class="m-0 text-eyebrow text-muted-foreground">{{ group.label ?? "Not about anyone in particular" }}</h3>
        <ul class="flex flex-col border border-border bg-card" data-testid="truth-ledger">
          <TruthRow
            v-for="truth in group.truths"
            :key="truth.id"
            :entry="truth"
            :selected="truth.id === selectedId"
            :knowers="byEntry.get(truth.id) ?? NO_KNOWERS"
            :move="canReorder ? endsOf(shown, truth.id) : null"
            @select="emit('select', truth.id)"
            @move="(direction) => reorder(shown, truth.id, direction)"
          />
        </ul>
      </div>
    </template>
    <EmptyState v-else-if="truths.length > 0" class="border border-dashed border-border bg-card" title="No truth matches" description="No truth has that mark." />
    <EmptyState
      v-else-if="arcLabel !== null"
      class="border border-dashed border-border bg-card"
      title="No truths in this arc"
      :description="`Nothing of this part is in ${arcLabel}.`"
    />
    <EmptyState
      v-else
      class="border border-dashed border-border bg-card"
      title="No truths yet"
      description="A truth is a fact about the world that stays true: what the table may take for granted, and what it may not."
    />

    <form class="flex flex-col gap-2" @submit.prevent="addTruth">
      <AppInput v-model="draft" tone="filled" size="body" placeholder="A new truth…" aria-label="A new truth" />
      <div class="flex flex-wrap items-center justify-end gap-2">
        <SegmentedControl v-model="mark" :options="MARK_OPTIONS" class="shrink-0" aria-label="Who knows it" />
        <AppButton
          type="submit"
          variant="outline"
          class="whitespace-nowrap"
          :icon="IconAdd"
          icon-size="xs"
          label="Add truth"
          :loading="isPending"
          :disabled="draft.trim() === ''"
        />
      </div>
    </form>
  </section>
</template>

<script setup lang="ts">
/**
 * Part II (frames 02 and 03): every truth with its mark and, for "known to some", the people and factions that know
 * it. A truth is always made with a mark, so the add row asks for one beside the words. The ledger can be filtered by
 * mark (or to the truths of no arc) and grouped by the record each truth is about (#1258 item 22).
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonSuggestFold from "./CanonSuggestFold.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import CanonRubric from "./CanonRubric.vue";
import TruthRow from "./TruthRow.vue";
import { MARK_OPTIONS } from "@/lib/canon/canonParts";
import { TRUTH_FILTER_OPTIONS, aboutByTruth, filterTruths, groupTruths } from "@/lib/canon/canonTruthView";
import { endsOf } from "@/lib/canon/canonOrder";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useKnowersByEntry, type Knower } from "@/composables/canon/useKnownToByEntry";
import { useWorldTies } from "@/composables/world/useWorldTies";
import { IconAdd } from "@/lib/icons";
import type { CanonEntry, KnowledgeMark } from "@/types/canon.types";

const { truths, selectedId = null, arcLabel = null } = defineProps<{
  /** The truths of the page's arc (every truth when none is chosen). */
  truths: readonly CanonEntry[];
  selectedId?: string | null;
  /** The name of the arc narrowing this part, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

// One read of every tie for the whole list, never one per truth.
const { byEntry } = useKnowersByEntry();
const NO_KNOWERS: readonly Knower[] = [];

const store = useCanonUiStore();
const shown = computed(() => filterTruths(truths, store.truthFilter));
// What each truth is about, from the one read of every tie the knowers above already share.
const { data: ties } = useWorldTies();
const groups = computed(() => (store.truthsGrouped ? groupTruths(shown.value, aboutByTruth(ties.value ?? [])) : [{ key: "all", label: null, truths: shown.value }]));
// Moving inside a narrowed, filtered or grouped list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null && store.truthFilter === "any" && !store.truthsGrouped);
const reorder = useCanonReorder();

const draft = ref("");
const mark = ref<KnowledgeMark>("all");
const { mutateAsync: create, isPending } = useCreateCanonEntry();

async function addTruth() {
  const title = draft.value.trim();
  if (title === "") return;
  try {
    const created = await create({ part: "truth", knowledge: mark.value, title, sort_order: truths.length });
    draft.value = "";
    emit("select", created.id);
  } catch {
    // The mutation has already told the DM (toast); the words stay in the box to try again.
  }
}
</script>
