<template>
  <div data-testid="panel-footer">
    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">Footer</h2>
      <p class="text-body text-foreground">Page {{ pageLabel }}</p>
      <p class="text-caption text-muted-foreground">
        Click a footer on any page to change it there. The running title is the book's on the left page and the
        chapter's on the right, as a printed book does.
      </p>
    </PanelSection>

    <PanelSection title="Running title, right pages">
      <SegmentedControl
        :model-value="settings.footerTitle"
        :options="TITLE_OPTIONS"
        block
        aria-label="Running title on right pages"
        @update:model-value="emit('settings', { footerTitle: $event })"
      />
      <AppInput
        v-if="settings.footerTitle === 'custom'"
        :model-value="settings.footerText"
        tone="muted"
        size="body"
        placeholder="Your own running title"
        aria-label="Custom running title"
        @update:model-value="emit('settings', { footerText: $event })"
      />
    </PanelSection>

    <PanelSection title="Numbers">
      <AppCheckbox
        size="sm"
        label="Show page numbers"
        :model-value="settings.showPageNumbers"
        @update:model-value="emit('settings', { showPageNumbers: $event })"
      />
      <PanelField label="Start at">
        <AppInput
          :model-value="String(settings.pageNumberStart)"
          type="number"
          min="1"
          tone="muted"
          size="body"
          :disabled="!settings.showPageNumbers"
          aria-label="First page number"
          @update:model-value="setStart"
        />
      </PanelField>
    </PanelSection>

    <PanelSection title="This page only">
      <AppCheckbox
        size="sm"
        :label="`No footer on page ${pageLabel}`"
        :model-value="markers.noFooter"
        @update:model-value="emit('markers', { ...markers, noFooter: $event, dontCount: $event })"
      />
      <AppCheckbox
        size="sm"
        label="Don't count this page"
        :hint="markers.noFooter ? 'A page with no footer is not counted either.' : undefined"
        :disabled="markers.noFooter"
        :model-value="markers.dontCount"
        @update:model-value="emit('markers', { ...markers, noFooter: false, dontCount: $event })"
      />
      <AppCheckbox
        size="sm"
        label="Start the count again here"
        :model-value="markers.restart"
        @update:model-value="emit('markers', { ...markers, restart: $event })"
      />
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/**
 * A footer selected on the page (#1176 story 6, frame 10). The running title
 * and the numbers are the book's, the same settings as Book settings; the
 * three choices at the foot are about this page only. They are stored as the
 * page-numbering markers in the text, which the DM never sees as chips.
 */
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import type { FooterChoices } from "@/scriptorium/lib/footerTitle";
import type { PageMarkers } from "@/scriptorium/lib/pageMarkers";
import type { ScriptoriumFooterTitle } from "@/scriptorium/types";

defineProps<{
  /** The page's number in the book, as the DM reads it. */
  pageLabel: string;
  settings: FooterChoices;
  markers: PageMarkers;
}>();
const emit = defineEmits<{
  settings: [values: Partial<FooterChoices>];
  markers: [next: PageMarkers];
}>();

const TITLE_OPTIONS: SegmentedOption<ScriptoriumFooterTitle>[] = [
  { value: "chapter", label: "Chapter" },
  { value: "book", label: "Book" },
  { value: "custom", label: "Custom" },
];

/** An emptied or sub-1 field keeps the last good number rather than writing 0. */
function setStart(value: string) {
  const n = Math.floor(Number(value));
  if (Number.isFinite(n) && n >= 1) emit("settings", { pageNumberStart: n });
}
</script>
