<template>
  <nav aria-label="Parts of the canon" data-testid="canon-contents">
    <!-- A phone: one row of chips that scrolls sideways. -->
    <div class="-mx-4 flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5 lg:hidden">
      <AppButton
        v-for="section in CANON_SECTIONS"
        :key="section.id"
        variant="chip"
        size="sm"
        class="shrink-0"
        :active="section.id === active"
        :aria-current="section.id === active ? 'true' : undefined"
        @click="emit('select', section.id)"
      >
        {{ section.numeral }} {{ section.short }}<template v-if="section.counted && counts[section.id] > 0"> · {{ countText(section.id) }}</template>
      </AppButton>
    </div>

    <!-- A desktop: the contents column, a numeral and a count per part. -->
    <ul class="hidden w-56 flex-col gap-0.5 lg:flex">
      <li v-for="section in CANON_SECTIONS" :key="section.id" :class="section.id === 'table' ? 'mt-1 border-t border-border pt-2' : ''">
        <AppButton
          variant="ghost"
          size="sm"
          block
          class="justify-start gap-2"
          :active="section.id === active"
          :aria-current="section.id === active ? 'true' : undefined"
          @click="emit('select', section.id)"
        >
          <span class="w-5 text-left text-label text-primary">{{ section.numeral }}</span>
          <span class="flex-1 text-left">{{ section.label }}</span>
          <span
            v-if="section.counted && (section.id !== 'table' || counts.table > 0)"
            class="text-label"
            :class="section.id === 'table' ? 'font-bold text-primary' : 'text-muted-foreground'"
            :data-testid="`count-${section.id}`"
          >{{ countText(section.id) }}</span>
        </AppButton>
        <p v-if="section.id === 'table'" class="m-0 px-2 pt-1 text-caption text-muted-foreground">{{ TABLE_SECTION_HINT }}</p>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
/** The parts of the canon: a column on a desktop, a row of chips on a phone. Choosing one scrolls the page to it. */
import AppButton from "@/components/common/controls/AppButton.vue";
import { CANON_SECTIONS, TABLE_SECTION_HINT, type CanonSectionId } from "@/lib/canon/canonParts";

const { counts } = defineProps<{ active: CanonSectionId; counts: Record<CanonSectionId, number> }>();
const emit = defineEmits<{ select: [id: CanonSectionId] }>();

/** A part's number; what the table added counts the lines still to review, so it reads "4 new". */
const countText = (id: CanonSectionId) => (id === "table" ? `${counts.table} new` : String(counts[id]));
</script>
