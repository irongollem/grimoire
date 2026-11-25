<template>
  <nav aria-label="Chapters of the canon" data-testid="canon-contents">
    <!-- Below 90rem: one picker, which the page puts above the chapter. -->
    <label class="flex items-center gap-2 min-[90rem]:hidden">
      <span class="text-eyebrow text-muted-foreground">Chapter</span>
      <AppSelect v-model="chosen" tone="filled" size="body" class="min-w-0" aria-label="Chapter" data-testid="canon-chapter-picker">
        <option v-for="chapter in CANON_SECTIONS" :key="chapter.id" :value="chapter.id">{{ pickerText(chapter.id) }}</option>
      </AppSelect>
    </label>

    <!-- From 90rem: the book's contents, grouped as the book is. -->
    <div class="hidden w-56 flex-col gap-3 min-[90rem]:flex">
      <section v-for="group in groups" :key="group.id" class="flex flex-col gap-0.5" :aria-label="group.label" :data-group="group.id">
        <h2 class="m-0 px-2 text-caption italic text-muted-foreground">{{ group.label }}</h2>
        <AppButton
          v-for="chapter in group.chapters"
          :key="chapter.id"
          variant="ghost"
          size="sm"
          block
          class="justify-start gap-2"
          :active="chapter.id === active"
          :aria-current="chapter.id === active ? 'true' : undefined"
          :data-part="chapter.id"
          @click="emit('select', chapter.id)"
        >
          <span class="flex-1 text-left">{{ chapter.label }}</span>
          <span v-if="chapter.counted && counts[chapter.id] > 0" class="text-label text-muted-foreground" :data-testid="`count-${chapter.id}`">{{ counts[chapter.id] }}</span>
        </AppButton>
      </section>
    </div>

    <!-- At the foot of the contents, whichever chapter is open (#1279 item 34c): a quiet link that opens what was deleted. -->
    <CanonDeleted class="mt-2 min-[90rem]:w-56" />
  </nav>
</template>

<script setup lang="ts">
/**
 * The book's contents: the chapters in their groups, with a count where a chapter counts entries, and the Deleted list at the foot. The page shows one
 * chapter at a time, and this is how the DM moves between them: a column from 90rem, a picker below it.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import CanonDeleted from "./CanonDeleted.vue";
import { CANON_GROUPS, CANON_SECTIONS, chapterOf, type CanonSectionId } from "@/lib/canon/canonParts";

const { active, counts } = defineProps<{ active: CanonSectionId; counts: Record<CanonSectionId, number> }>();
const emit = defineEmits<{ select: [id: CanonSectionId] }>();

const groups = CANON_GROUPS.map((group) => ({ ...group, chapters: CANON_SECTIONS.filter((c) => c.group === group.id) }));

const chosen = computed<CanonSectionId>({
  get: () => active,
  set: (id) => {
    if (id !== active) emit("select", id);
  },
});

const pickerText = (id: CanonSectionId) => {
  const chapter = chapterOf(id);
  return chapter.counted && counts[id] > 0 ? `${chapter.label} · ${counts[id]}` : chapter.label;
};
</script>
