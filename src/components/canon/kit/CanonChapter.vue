<template>
  <div class="@container flex min-w-0 flex-col gap-4" :data-chapter="chapter" :data-open="open ? '' : undefined">
    <div class="flex items-start gap-6">
      <!-- The list: always from 56rem of the chapter's own width, and below that only while no entry is open. -->
      <div class="flex min-w-0 flex-1 flex-col gap-3 @4xl:w-[24rem] @4xl:flex-none" :class="open ? 'hidden @4xl:flex' : ''" data-testid="canon-chapter-list">
        <header class="flex flex-col gap-0.5">
          <h2 class="m-0 text-heading-sm font-bold">{{ title }}</h2>
          <p class="m-0 text-caption italic text-muted-foreground">{{ why }}</p>
        </header>
        <slot name="toolbar" />
        <slot />
        <slot name="add" />
      </div>

      <!-- Beside the list from 56rem, replacing it below; the page scrolls to this id after a tap. -->
      <div v-if="open" id="canon-inline-detail" class="flex min-w-0 flex-1 flex-col gap-3 @4xl:max-w-3xl" data-testid="canon-chapter-entry">
        <AppButton class="self-start @4xl:hidden" variant="ghost" size="sm" :icon="IconChevronLeft" icon-size="xs" :label="`Back to ${backLabel}`" data-testid="canon-chapter-back" @click="emit('close')" />
        <slot name="entry" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The one layout of a Canon chapter that is a list of entries. The entry opens in one place, beside the list: from
 * 56rem of the chapter's own width the list is a 24rem column and the entry takes the rest; below that the entry replaces
 * the list, with a Back button. There is no side column and nothing opens under the list. The container query is on this
 * root, so it answers to the room the chapter has, not to the viewport.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronLeft } from "@/lib/icons";
import type { CanonSectionId } from "@/lib/canon/canonParts";

const { chapter, title, why, open, backLabel } = defineProps<{
  chapter: CanonSectionId;
  title: string;
  /** One line on what the chapter is for. */
  why: string;
  /** An entry is open. */
  open: boolean;
  /** The chapter's name, for "Back to <backLabel>". */
  backLabel: string;
}>();
const emit = defineEmits<{ close: [] }>();
</script>
