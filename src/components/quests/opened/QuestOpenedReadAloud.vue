<template>
  <section v-if="hasText" class="rounded-lg border border-primary/30 bg-primary/5" aria-label="Read aloud">
    <template v-if="folded">
      <AppButton
        variant="menu"
        size="body"
        block
        class="min-h-11 gap-2 px-3 py-2"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span class="shrink-0 text-label font-bold uppercase text-primary">Read aloud</span>
        <IconChevronRight class="h-4 w-4 shrink-0 text-primary transition-transform" :class="open && 'rotate-90'" aria-hidden="true" />
        <span v-if="!open" class="min-w-0 flex-1 truncate text-left font-fell text-body italic text-foreground">{{ firstLine }}</span>
      </AppButton>
      <div v-if="open" class="border-t border-primary/30 p-3"><RichTextViewer :content="beat.read_aloud!" /></div>
    </template>
    <div v-else class="p-4">
      <h3 class="mb-2 text-heading-sm font-bold text-primary">Read aloud</h3>
      <RichTextViewer :content="beat.read_aloud!" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { hasBeatText } from "@/lib/quests/beatText";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import { IconChevronRight } from "@/lib/icons";
import type { QuestBeat } from "@/types/quest.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";

/**
 * The beat's read-aloud. At a site the room stack carries the table's words,
 * so the beat's own folds to one line that opens on tap (#1183, frame 04).
 */
const { beat, folded = false } = defineProps<{ beat: QuestBeat; folded?: boolean }>();
const open = ref(false);
const hasText = computed(() => hasBeatText(beat.read_aloud));
const firstLine = computed(() => tiptapToPlainText(beat.read_aloud).split("\n").find((line) => line.trim() !== "")?.trim() ?? "");
</script>
