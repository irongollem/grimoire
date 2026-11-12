<template>
  <!-- A picture can cover the whole page behind or over the text; then its width, corner and anchor mean nothing. -->
  <template v-if="item.kind === 'art'">
    <AppButton
      v-if="!filled"
      variant="subtle"
      size="sm"
      label="Fill the page"
      tooltip="Cover the whole page edge to edge, cropped to fit"
      @click="fillPage"
    />
    <template v-else>
      <p class="text-caption italic text-muted-foreground">This picture fills its page, edge to edge. Dragging or resizing it sets it free.</p>
      <AppButton variant="subtle" size="sm" label="Stop filling the page" @click="stopFilling" />
    </template>
  </template>
  <PanelRange v-if="item.kind !== 'watermark' && !filled" label="Width" :model-value="item.width" :min="5" :max="100" @update:model-value="emit('patch', { width: $event })" />
  <!-- A picture in a page corner hugs both paper edges and stays on that page. -->
  <template v-if="canPinToCorner(item.kind) && !filled">
    <PanelField label="Place">
      <SegmentedControl
        :model-value="item.corner ?? 'free'"
        :options="placeOptions"
        size="xs"
        wrap
        block
        @update:model-value="emit('corner', $event)"
      />
    </PanelField>
    <PanelField label="Stays">
      <SegmentedControl
        :model-value="item.anchor.type"
        :options="stayOptions"
        size="xs"
        wrap
        block
        @update:model-value="emit('stays', $event)"
      />
    </PanelField>
  </template>
</template>

<script setup lang="ts">
/**
 * Where placed art sits on its page: how wide it is, which corner it hugs
 * (Free or one of four), and what it stays with (its paragraph or its page).
 * Shared by a picture placed on the page and by a watercolour, which are the
 * two kinds that can be pinned.
 */
import { computed, nextTick } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelRange from "@/scriptorium/components/panel/PanelRange.vue";
import { FURNITURE_CORNERS, canPinToCorner, fillsPage, withoutFill } from "@/scriptorium/lib/furniture/model";
import type { AnchorState } from "@/scriptorium/composables/useEditorPictures";
import type { FurnitureCorner, PageFurnitureItem } from "@/scriptorium/types";

const { item, anchor } = defineProps<{ item: PageFurnitureItem; anchor: AnchorState }>();
const emit = defineEmits<{
  patch: [patch: Partial<PageFurnitureItem>];
  corner: [value: string | undefined];
  stays: [value: string | undefined];
}>();

const filled = computed(() => fillsPage(item));

/**
 * Filling pins the picture to the page it is drawn on through the same route a
 * corner does (which owns the page lookup), then, once that has landed, marks
 * it filled. The patch is built from the item as it is then, so it cannot undo
 * the pin.
 */
async function fillPage() {
  emit("corner", "top-left");
  await nextTick();
  emit("patch", { props: { ...item.props, fill: "page" } });
}

/** Back to an ordinary picture: still in the top-left corner at its own width, which the DM can then move. */
function stopFilling() {
  emit("patch", { props: withoutFill(item).props });
}

const CORNER_LABELS: Record<FurnitureCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};
const NO_PAGE_REASON = "The page this sits on is not laid out yet.";

const placeOptions = computed(() => [
  { value: "free", label: "Free", disabled: !anchor.canFree, tooltip: anchor.canFree ? undefined : NO_PAGE_REASON },
  ...FURNITURE_CORNERS.map((c) => ({ value: c, label: CORNER_LABELS[c] })),
]);

const stayOptions = computed(() => {
  const onPage = item.anchor.type === "page";
  const noParagraph = onPage && !anchor.hasParagraph;
  const noPage = !onPage && anchor.page === null;
  return [
    {
      value: "block",
      label: "With its paragraph",
      disabled: noParagraph,
      tooltip: noParagraph ? "No paragraph is laid out on this page to follow." : undefined,
    },
    {
      value: "page",
      label: anchor.page === null ? "On its page" : `On page ${anchor.page}`,
      disabled: noPage,
      tooltip: noPage ? NO_PAGE_REASON : undefined,
    },
  ];
});
</script>
