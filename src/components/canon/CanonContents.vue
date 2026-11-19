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
        {{ section.numeral }} {{ section.short }}<template v-if="counts[section.id] > 0"> · {{ counts[section.id] }}</template>
      </AppButton>
    </div>

    <!-- A desktop: the contents column, a numeral and a count per part. -->
    <ul class="hidden w-56 flex-col gap-0.5 lg:flex">
      <li v-for="section in CANON_SECTIONS" :key="section.id">
        <AppButton
          variant="ghost"
          size="sm"
          block
          class="justify-start gap-2"
          :active="section.id === active"
          :aria-current="section.id === active ? 'true' : undefined"
          @click="emit('select', section.id)"
        >
          <span class="w-5 text-left font-cinzel text-label text-primary">{{ section.numeral }}</span>
          <span class="flex-1 text-left">{{ section.label }}</span>
          <span class="text-label text-muted-foreground">{{ counts[section.id] }}</span>
        </AppButton>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
/** The parts of the canon: a column on a desktop, a row of chips on a phone. Choosing one scrolls the page to it. */
import AppButton from "@/components/common/controls/AppButton.vue";
import { CANON_SECTIONS, type CanonSectionId } from "./canonParts";

defineProps<{ active: CanonSectionId; counts: Record<CanonSectionId, number> }>();
const emit = defineEmits<{ select: [id: CanonSectionId] }>();
</script>
