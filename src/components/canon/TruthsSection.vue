<template>
  <section id="canon-truths" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-truths-heading">
    <CanonRubric id="canon-truths-heading" numeral="II" title="Truths" />

    <CanonSuggestions mode="truths" :entries="truths" />

    <ul v-if="truths.length > 0" class="flex flex-col border border-border bg-card" data-testid="truth-ledger">
      <TruthRow
        v-for="truth in truths"
        :key="truth.id"
        :entry="truth"
        :selected="truth.id === selectedId"
        :knowers="byEntry.get(truth.id) ?? NO_KNOWERS"
        @select="emit('select', truth.id)"
      />
    </ul>
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
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import CanonRubric from "./CanonRubric.vue";
import TruthRow from "./TruthRow.vue";
import { MARK_OPTIONS } from "@/lib/canon/canonParts";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useKnowersByEntry, type Knower } from "@/composables/canon/useKnownToByEntry";
import { IconAdd } from "@/lib/icons";
import type { CanonEntry, KnowledgeMark } from "@/types/canon.types";

const { truths, selectedId = null } = defineProps<{ truths: readonly CanonEntry[]; selectedId?: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();

// One read of every tie for the whole list, never one per truth.
const { byEntry } = useKnowersByEntry();
const NO_KNOWERS: readonly Knower[] = [];

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
