<template>
  <div class="overflow-hidden rounded-lg border bg-card transition-colors" :class="isExpanded ? 'border-primary/40' : 'border-border'">
    <!-- Wraps rather than squeezes: the status can be long ("Add from library:
         Wraith · CR 5 · undead · Level Up Advanced 5e…"), and a shrink-0 chip in
         a single row truncated the entity's own name down to one letter. The
         name's basis is its own width, so when both don't fit it is the status
         that drops to its own line; `truncate` only bites a name wider than
         the whole row. -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 p-3">
      <AppButton
        variant="ghost"
        size="md"
        class="min-h-0 min-w-0 flex-auto justify-start gap-2 px-0 py-0"
        :aria-expanded="isExpanded"
        :aria-controls="regionId"
        @click="toggleExpanded"
      >
        <IconChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform" :class="isExpanded ? 'rotate-180' : ''" />
        <span class="truncate text-heading-xs font-bold text-foreground">{{ heading }}</span>
        <slot name="meta" />
      </AppButton>
      <AppButton as="span" variant="tinted" :tone="status.tone" size="xs" :label="status.label" class="max-w-full" />
    </div>

    <div v-if="isExpanded" :id="regionId" class="space-y-3 border-t border-border p-3">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The collapsible shell of one row in an import review: a header that names
 * the entry and says what will happen to it, and a body with the choice. Both
 * reviews use it, the AI import's (`ImportEntityReviewRow`) and the wiki
 * export's (`ArchiveReviewRow`, #932); each fills the body with its own
 * controls. The body renders only while open, so work done inside it (a
 * two-thousand-page export's previews) waits until a row is opened.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { ButtonTone } from "@/components/common/controls/appButtonVariants";
import { IconChevronDown } from "@/lib/icons";

const { heading, status, regionId, autoExpand = false } = defineProps<{
  heading: string;
  status: { label: string; tone: ButtonTone };
  /** Collision-safe id of the expandable body, for `aria-controls`. */
  regionId: string;
  /** Open by itself when the DM has a real choice to make; a click overrides it. */
  autoExpand?: boolean;
}>();

const manualExpanded = ref<boolean | null>(null);
const isExpanded = computed(() => manualExpanded.value ?? autoExpand);
function toggleExpanded(): void {
  manualExpanded.value = !isExpanded.value;
}
</script>
