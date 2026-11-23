<template>
  <section id="canon-truths" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-truths-heading">
    <CanonRubric id="canon-truths-heading" numeral="II" title="Truths" />

    <CanonSuggestions mode="truths" :entries="truths" />

    <CanonPartFind part="truths" noun="truth" :count="truths.length" :arc-label="arcLabel" />

    <ul v-if="shown.length > 0" class="flex flex-col border border-border bg-card" data-testid="truth-ledger">
      <TruthRow
        v-for="truth in shown"
        :key="truth.id"
        :entry="truth"
        :selected="truth.id === selectedId"
        :knowers="byEntry.get(truth.id) ?? NO_KNOWERS"
        :move="canReorder ? endsOf(shown, truth.id) : null"
        @select="emit('select', truth.id)"
        @move="(direction) => reorder(shown, truth.id, direction)"
      />
    </ul>
    <EmptyState v-else-if="truths.length > 0" class="border border-dashed border-border bg-card" title="No truth matches" description="Nothing here has those words in it." />
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
 * it. A truth is always made with a mark, so the add row asks for one beside the words.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import CanonPartFind from "./CanonPartFind.vue";
import CanonRubric from "./CanonRubric.vue";
import TruthRow from "./TruthRow.vue";
import { MARK_OPTIONS } from "@/lib/canon/canonParts";
import { matchesQuery } from "@/lib/canon/canonNarrow";
import { endsOf } from "@/lib/canon/canonOrder";
import { useCanonReorder } from "@/composables/canon/useCanonReorder";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useKnowersByEntry, type Knower } from "@/composables/canon/useKnownToByEntry";
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
const shown = computed(() => truths.filter((t) => matchesQuery(t.title, store.partQuery.truths)));
// Moving inside a narrowed list would be ambiguous, so the buttons wait for the whole list.
const canReorder = computed(() => arcLabel === null && store.partQuery.truths.trim() === "");
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
