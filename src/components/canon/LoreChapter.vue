<template>
  <CanonChapter chapter="lore" :title="chapter.label" :why="chapter.why" :open="selected !== null" :back-label="chapter.label" @close="emit('close')">
    <template #toolbar>
      <CanonReview mode="lore" :entries="lore" :lore="NEW_LORE" @accepted="(id) => emit('select', id)" />
      <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>
      <div v-if="lore.length > 0" class="flex flex-wrap items-center gap-2" data-testid="lore-toolbar">
        <AppSelect v-model="ui.loreKindFilter" tone="filled" weight="normal" size="body" aria-label="Show lore of one kind" data-testid="lore-kind-filter">
          <option :value="null">All kinds</option>
          <option v-for="k in LORE_KIND_OPTIONS" :key="k.value" :value="k.value">{{ k.label }}</option>
        </AppSelect>
        <AppButton v-if="ui.loreHasActiveFilters" variant="ghost" size="sm" label="Clear" data-testid="lore-clear" @click="ui.resetLoreFilters()" />
      </div>
    </template>

    <ul v-if="shown.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="lore-ledger">
      <CanonRow v-for="entry in shown" :id="`canon-entry-${entry.id}`" :key="entry.id" :title="entry.title" :selected="entry.id === selected?.id" @select="emit('select', entry.id)">
        <template v-if="!lowArt && entry.image_url" #lead>
          <div class="size-12 shrink-0 overflow-hidden rounded bg-muted">
            <FocalImage :src="entry.image_url" alt="" format="portrait" class="size-full" />
          </div>
        </template>
        <span class="mt-1 flex flex-wrap gap-x-3 text-label text-muted-foreground">
          <span v-if="entry.lore_kind" data-testid="lore-kind">{{ LORE_KIND_LABEL[entry.lore_kind] }}</span>
          <span v-if="dateOf(entry)" data-testid="lore-date">{{ dateOf(entry) }}</span>
        </span>
        <template #mark><span class="text-label font-bold text-foreground" data-testid="lore-told">{{ toldWords(tallyOf(entry.id)) }}</span></template>
      </CanonRow>
    </ul>
    <CanonEmpty v-else-if="lore.length > 0" title="No lore of that kind" text="Nothing of this chapter is of that kind." />
    <CanonEmpty v-else-if="arcLabel !== null" title="No lore in this arc" :text="`Nothing of this chapter is in ${arcLabel}.`" />
    <CanonEmpty v-else title="No lore yet" :text="EMPTY_TEXT" ask="Suggest a piece of lore for my world." />

    <template #add>
      <CanonAddRow v-model="draftTitle" placeholder="A new piece of lore, by its title…" input-label="A new piece of lore" label="Add lore" :create="addLore">
        <AppSelect v-model="draftKind" tone="filled" weight="normal" size="body" aria-label="What kind of lore">
          <option :value="null">Any kind</option>
          <option v-for="k in LORE_KIND_OPTIONS" :key="k.value" :value="k.value">{{ k.label }}</option>
        </AppSelect>
      </CanonAddRow>
    </template>

    <template #entry>
      <LoreDetail v-if="selected" :key="selected.id" :entry="selected" @close="emit('close')" @delete="emit('delete')" />
    </template>
  </CanonChapter>
</template>

<script setup lang="ts">
/**
 * The Lore chapter: the entries by date in the world, the undated after them, each with its kind, its date and how much
 * of it has been told. A new entry is started from a title (and a kind). Lore reads by its date, so it has no manual
 * order. It filters by kind. The open entry shows beside the list.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonReview from "./CanonReview.vue";
import CanonChapter from "./kit/CanonChapter.vue";
import CanonEmpty from "./kit/CanonEmpty.vue";
import CanonRow from "./kit/CanonRow.vue";
import LoreDetail from "./LoreDetail.vue";
import { chapterOf } from "@/lib/canon/canonParts";
import { LORE_KIND_LABEL, LORE_KIND_OPTIONS, entryDate, sortLore, worldDateLabel } from "@/lib/canon/canonLore";
import { useCanonUiStore } from "@/stores/ui/canon";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { passagesOf, toldTally, useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useLowArt } from "@/composables/useLowArt";
import { useCalendarStore } from "@/stores/calendar";
import type { CanonEntry, LoreKind } from "@/types/canon.types";

// The review of a lore draft that is not yet an entry: the Familiar keeps it under the `lore:new` key.
const NEW_LORE = { title: "", kind: null, entryId: null, text: "" };
const EMPTY_TEXT = "Lore is what the world remembers: its history, legends, faiths and ways. Tell it in passages, and the party hears each one when you say so.";

const { lore, selected = null, arcLabel = null } = defineProps<{
  /** The lore of the page's arc (all of it when none is chosen). */
  lore: readonly CanonEntry[];
  /** The open entry, read from the whole canon so an arc change does not close it. */
  selected?: CanonEntry | null;
  /** The name of the arc narrowing this chapter, or null. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: string]; close: []; delete: [] }>();

const chapter = chapterOf("lore");
const ui = useCanonUiStore();
// The kind filter narrows the list the DM reads; lore has no manual order, so nothing else depends on the whole list.
const shown = computed(() => sortLore(ui.loreKindFilter === null ? lore : lore.filter((e) => e.lore_kind === ui.loreKindFilter)));
const { data: passages } = useCanonPassages();
const tallyOf = (id: string) => toldTally(passagesOf(passages.value ?? [], id));
const { lowArt } = useLowArt();
// The row's sign: how much of the entry has been told. The first passage is told with the entry, so an entry with any passage has told at least one.
function toldWords({ told, total }: { told: number; total: number }): string {
  if (total === 0) return "None told";
  return told >= total ? "All told" : `${told} of ${total} told`;
}
const calendar = useCalendarStore();
const dateOf = (e: CanonEntry) => worldDateLabel(entryDate(e), (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f));

const draftTitle = ref("");
const draftKind = ref<LoreKind | null>(null);
const { mutateAsync: create } = useCreateCanonEntry();

async function addLore(title: string) {
  const created = await create({ part: "lore", title, lore_kind: draftKind.value, sort_order: lore.length, arc_id: ui.arcFilter });
  emit("select", created.id);
}
</script>
