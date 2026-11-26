<template>
  <nav class="flex flex-col gap-2" aria-label="Chapters of the canon" data-testid="canon-contents">
    <!-- The arc the counts and chapters are narrowed to, wherever the Arc control itself is hidden (#1279 item 18). -->
    <div v-if="arcLabel !== null" class="flex items-center gap-1 border border-primary/40 bg-primary/10 py-0.5 pr-0.5 pl-2" role="status" data-testid="canon-arc-chip">
      <span class="min-w-0 flex-1 truncate text-label text-foreground">Narrowed to the arc “{{ arcLabel }}”</span>
      <AppButton variant="ghost" size="sm" label="Clear" data-testid="canon-arc-chip-clear" @click="emit('clearArc')" />
    </div>

    <!-- Narrower than the column's room: one picker, with the same groups the column has. -->
    <label class="flex items-center gap-2 @min-[60rem]/canon:hidden">
      <span class="text-eyebrow text-muted-foreground">Chapter</span>
      <AppSelect v-model="chosen" tone="filled" size="body" class="min-w-0" aria-label="Chapter" data-testid="canon-chapter-picker">
        <optgroup v-for="group in groups" :key="group.id" :label="group.label">
          <option v-for="chapter in group.chapters" :key="chapter.id" :value="chapter.id">{{ pickerText(chapter.id) }}</option>
        </optgroup>
      </AppSelect>
    </label>

    <!-- With room for it: the book's contents, grouped as the book is. -->
    <div class="hidden w-56 flex-col gap-3 @min-[60rem]/canon:flex">
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
    <CanonDeleted class="mt-2 @min-[60rem]/canon:w-56" />
  </nav>
</template>

<script setup lang="ts">
/**
 * The book's contents: the chapters in their groups, with a count where a chapter counts entries, and the Deleted list at the foot. The page shows one
 * chapter at a time, and this is how the DM moves between them: a column when the page is wide enough (a container query on the page's own width, not the screen's), a picker below it that keeps the groups.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import CanonDeleted from "./CanonDeleted.vue";
import { CANON_GROUPS, CANON_SECTIONS, chapterOf, type CanonSectionId } from "@/lib/canon/canonParts";

const { active, counts, arcLabel = null } = defineProps<{
  active: CanonSectionId;
  counts: Record<CanonSectionId, number>;
  /** The arc the page is narrowed to, by name; null when it shows everything. */
  arcLabel?: string | null;
}>();
const emit = defineEmits<{ select: [id: CanonSectionId]; clearArc: [] }>();

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
