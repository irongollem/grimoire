<template>
  <CanonRow :id="`canon-entry-${entry.id}`" :label="entry.title" :selected="selected" @select="emit('select')">
    <div v-if="!lowArt && entry.image_url" class="size-12 shrink-0 overflow-hidden rounded bg-muted">
      <FocalImage :src="entry.image_url" alt="" format="portrait" class="size-full" />
    </div>
    <span class="min-w-0 flex-1">
      <span class="block text-body leading-snug text-foreground">{{ entry.title }}</span>
      <span class="mt-1 flex flex-wrap gap-x-3 text-label text-muted-foreground">
        <span v-if="entry.lore_kind" data-testid="lore-kind">{{ LORE_KIND_LABEL[entry.lore_kind] }}</span>
        <span v-if="date" data-testid="lore-date">{{ date }}</span>
      </span>
    </span>
    <template #mark>
      <span class="text-label font-bold text-foreground" data-testid="lore-told">{{ toldWords(tally) }}</span>
    </template>
  </CanonRow>
</template>

<script setup lang="ts">
import CanonRow from "./kit/CanonRow.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useLowArt } from "@/composables/useLowArt";
import { LORE_KIND_LABEL } from "@/lib/canon/canonLore";
import type { CanonEntry } from "@/types/canon.types";

type Tally = { told: number; total: number };

defineProps<{ entry: CanonEntry; tally: Tally; date: string | null; selected?: boolean }>();
const emit = defineEmits<{ select: [] }>();

const { lowArt } = useLowArt();

/** The row's sign: how much of the entry has been told. The first passage is told with the entry, so an entry with any passage has told at least one. */
function toldWords({ told, total }: Tally): string {
  if (total === 0) return "None told";
  return told >= total ? "All told" : `${told} of ${total} told`;
}
</script>
