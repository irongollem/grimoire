<template>
  <CanonChapter chapter="lore" :title="chapter.label" :why="chapter.why" :open="selected !== null" :back-label="chapter.label" @close="emit('close')">
    <template #toolbar>
      <p v-if="arcLabel !== null" class="m-0 text-caption text-muted-foreground" data-testid="arc-note">Showing {{ arcLabel }} only.</p>
    </template>

    <ul v-if="shown.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="lore-ledger">
      <LoreRow
        v-for="entry in shown"
        :key="entry.id"
        :entry="entry"
        :tally="tallyOf(entry.id)"
        :date="dateOf(entry)"
        :selected="entry.id === selected?.id"
        @select="emit('select', entry.id)"
      />
    </ul>
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
 * order. The open entry shows beside the list.
 */
import { computed, ref } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import CanonAddRow from "./CanonAddRow.vue";
import CanonChapter from "./kit/CanonChapter.vue";
import CanonEmpty from "./kit/CanonEmpty.vue";
import LoreDetail from "./LoreDetail.vue";
import LoreRow from "./LoreRow.vue";
import { chapterOf } from "@/lib/canon/canonParts";
import { LORE_KIND_OPTIONS, entryDate, sortLore, worldDateLabel } from "@/lib/canon/canonLore";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { passagesOf, toldTally, useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useCalendarStore } from "@/stores/calendar";
import type { CanonEntry, LoreKind } from "@/types/canon.types";

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
const shown = computed(() => sortLore(lore));
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
