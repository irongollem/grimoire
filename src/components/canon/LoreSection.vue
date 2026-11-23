<template>
  <section id="canon-lore" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-lore-heading">
    <CanonRubric id="canon-lore-heading" numeral="VII" title="Lore" />

    <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>

    <ul v-if="shown.length > 0" class="flex flex-col border border-border bg-card" data-testid="lore-ledger">
      <LoreRow
        v-for="entry in shown"
        :key="entry.id"
        :entry="entry"
        :tally="tallyOf(entry.id)"
        :date="dateOf(entry)"
        :selected="entry.id === selectedId"
        @select="emit('select', entry.id)"
      />
    </ul>
    <EmptyState
      v-else-if="arcLabel !== null"
      class="border border-dashed border-border bg-card"
      title="No lore in this arc"
      :description="`Nothing of this part is in ${arcLabel}.`"
    />
    <EmptyState
      v-else
      class="border border-dashed border-border bg-card"
      title="No lore yet"
      description="Lore is what the world remembers: its history, legends, faiths and ways. Tell it in passages, and the party hears each one when you say so."
    />

    <CanonAddRow v-model="draftTitle" placeholder="A new piece of lore, by its title…" input-label="A new piece of lore" label="Add lore" :create="addLore">
      <AppSelect v-model="draftKind" tone="filled" weight="normal" size="body" aria-label="What kind of lore">
        <option :value="null">Any kind</option>
        <option v-for="k in LORE_KIND_OPTIONS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </AppSelect>
    </CanonAddRow>

    <CanonSuggestFold part="lore">
      <CanonSuggestions mode="lore" :entries="lore" :lore="{ title: draftTitle, kind: draftKind, entryId: null, text: '' }" @accepted="(id) => emit('select', id)" />
    </CanonSuggestFold>
  </section>
</template>

<script setup lang="ts">
/**
 * Part VII (frames 04 and 04b): the lore entries by date in the world, the undated after them, each with its kind, its
 * date and how much of it has been told. A new entry is started from a title (and a kind); "Draft a lore entry" drafts
 * one from that same title and kind.
 */
import { computed, ref } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonRubric from "./CanonRubric.vue";
import CanonSuggestFold from "./CanonSuggestFold.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import LoreRow from "./LoreRow.vue";
import { LORE_KIND_OPTIONS, entryDate, sortLore, worldDateLabel } from "@/lib/canon/canonLore";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { passagesOf, toldTally, useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useCalendarStore } from "@/stores/calendar";
import type { CanonEntry, LoreKind } from "@/types/canon.types";

const { lore, selectedId = null, arcLabel = null } = defineProps<{
  /** The lore of the page's arc (all of it when none is chosen). */
  lore: readonly CanonEntry[];
  selectedId?: string | null;
  /** The name of the arc narrowing this part, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const ordered = computed(() => sortLore(lore));
// Lore reads by its date in the world, so it has no manual order.
const shown = ordered;
const { data: passages } = useCanonPassages();
const tallyOf = (id: string) => toldTally(passagesOf(passages.value ?? [], id));
const calendar = useCalendarStore();
const dateOf = (e: CanonEntry) => worldDateLabel(entryDate(e), (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f));

const draftTitle = ref("");
const draftKind = ref<LoreKind | null>(null);
const { mutateAsync: create } = useCreateCanonEntry();

async function addLore(title: string) {
  const created = await create({ part: "lore", title, lore_kind: draftKind.value, sort_order: lore.length });
  emit("select", created.id);
}
</script>
