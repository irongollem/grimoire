<template>
  <div data-testid="panel-picture">
    <PanelSection>
      <div class="flex items-center gap-3">
        <img v-if="src" :src="src" alt="" class="size-14 shrink-0 rounded-sm border border-border bg-muted object-cover" />
        <div class="min-w-0">
          <h2 class="text-eyebrow uppercase text-primary">Picture</h2>
          <p class="text-body text-foreground" data-testid="panel-picture-where">{{ where }}</p>
          <!-- The label of record is in the picture's own bytes; this chip is for the author, and never prints. -->
          <AiImageBadge :src="src" inline />
        </div>
      </div>
    </PanelSection>

    <PanelSection title="Layer">
      <SegmentedControl :model-value="layer" :options="layerOptions" size="xs" block @update:model-value="emit('layer', $event)" />
    </PanelSection>

    <!-- In the text: the options the toolbar used to carry. -->
    <PanelSection v-if="layer === 'text' && nodeAttrs" title="In the text">
      <PanelField label="Size">
        <SegmentedControl :model-value="sizeValue" :options="sizeOptions" size="xs" block @update:model-value="emit('nodeAttrs', { width: $event })" />
      </PanelField>
      <PanelField label="Align">
        <SegmentedControl :model-value="alignValue" :options="ALIGN_OPTIONS" size="xs" block @update:model-value="emit('nodeAttrs', { dataAlign: $event, layoutMode: 'inline' })" />
      </PanelField>
      <PanelField label="Wrap text">
        <SegmentedControl :model-value="wrapValue" :options="WRAP_OPTIONS" size="xs" block @update:model-value="emit('nodeAttrs', { layoutMode: $event })" />
      </PanelField>
      <template v-if="wrapped">
        <AppCheckbox
          size="sm"
          label="Bleed into the column gutter"
          :model-value="nodeAttrs.gutterBleed === true"
          @update:model-value="emit('nodeAttrs', { gutterBleed: $event })"
        />
        <AppCheckbox
          size="sm"
          label="Keep with its text"
          hint="In print the picture stays with its paragraph, even a long one."
          :model-value="nodeAttrs.keepWithText === true"
          @update:model-value="emit('nodeAttrs', { keepWithText: $event })"
        />
      </template>
    </PanelSection>

    <!-- On the page: behind or in front of the text. -->
    <PanelSection v-else-if="item && anchor" title="On the page">
      <PanelRange
        v-if="layer === 'under'"
        label="Strength"
        :model-value="numProp(item.props, 'opacity', DEFAULT_UNDER_ART_OPACITY)"
        :min="20"
        :max="100"
        @update:model-value="emit('item', { props: { ...item.props, opacity: $event } })"
      />
      <PlacementFields :item="item" :anchor="anchor" @patch="emit('item', $event)" @corner="emit('corner', $event)" @stays="emit('stays', $event)" />
      <p class="text-caption italic text-muted-foreground">Drag the picture on the page to move it; drag its corner to resize.</p>
    </PanelSection>

    <!-- Paper: how the picture sits on the page, for a picture in the text and for art on it (frame 11). -->
    <PanelSection v-if="nodeAttrs || item" title="Paper">
      <SegmentedControl :model-value="blendValue" :options="BLEND_OPTIONS" size="xs" wrap data-testid="panel-picture-blend" @update:model-value="setBlend" />
    </PanelSection>

    <!-- Quick edits: the picture's recipe, written where the picture sits (frame 11). -->
    <PictureEditSection v-if="canEdit && values" :values="values" @patch="onTreatment" @workbench="emit('edit')" />

    <PanelSection>
      <div class="flex flex-wrap gap-2">
        <AppButton variant="subtle" size="sm" :icon="IconLibrary" label="Replace…" @click="emit('pick')" />
        <AppButton variant="link" size="sm" :icon="IconAddImage" label="Upload a file" :active="showUpload" @click="showUpload = !showUpload" />
        <AppButton
          variant="subtle"
          size="sm"
          :icon="IconBrush"
          label="Edit picture…"
          :disabled="!canEdit"
          :tooltip="canEdit ? 'Open the Illuminator over the book' : editHint"
          @click="emit('edit')"
        />
        <AppButton
          variant="subtle"
          size="sm"
          :icon="IconCrop"
          label="Crop"
          :disabled="!canEdit"
          :tooltip="canEdit ? 'Open the Illuminator on the Crop tool' : editHint"
          data-testid="panel-crop"
          @click="emit('edit', 'crop')"
        />
      </div>
      <ImageUpload
        v-if="showUpload"
        :model-value="null"
        bucket="asset-images"
        placeholder="Drop a picture or click to upload"
        @update:model-value="onUploaded"
      />
      <AppButton variant="destructive" size="sm" :icon="IconDelete" label="Remove picture" @click="emit('remove')" />
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/**
 * A picture, wherever it lives (#1176, frames 04 and 05): an image in the text
 * or art placed on the page, as one section. The Layer control is the only
 * thing that says which; what follows changes with it. This component only
 * draws and reports: moving a picture between its two homes is the editor's.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import AiImageBadge from "@/components/common/ai/AiImageBadge.vue";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelRange from "@/scriptorium/components/panel/PanelRange.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import PictureEditSection from "@/scriptorium/components/panel/PictureEditSection.vue";
import PlacementFields from "@/scriptorium/components/panel/PlacementFields.vue";
import { IMAGE_SIZES } from "@/scriptorium/lib/editorConstants";
import { DEFAULT_UNDER_ART_OPACITY } from "@/scriptorium/lib/furniture/renderFurniture";
import { mergeTreatmentPatch, type TreatmentPatch } from "@/scriptorium/lib/panel/pictureTreatment";
import { numProp } from "@/scriptorium/lib/panel/propReaders";
import type { AnchorState } from "@/scriptorium/composables/useEditorPictures";
import type { PageFurnitureItem } from "@/scriptorium/types";
import { artBlend, imageBlend, type PictureBlend } from "@/scriptorium/lib/furniture/blend";
import type { WorkbenchTool } from "@/scriptorium/illuminator/useIlluminateWorkbench";
import { IconAddImage, IconBrush, IconCrop, IconDelete, IconLibrary } from "@/lib/icons";

export type PictureLayer = "under" | "over" | "text";

const { layer, nodeAttrs = null, item = null, anchor = null } = defineProps<{
  src: string | null;
  layer: PictureLayer;
  /** "Placed on page 16" or "In the text". */
  where: string;
  /** The image node's attrs, when the picture is in the text. */
  nodeAttrs?: Record<string, unknown> | null;
  /** The art item, when it is placed on the page. */
  item?: PageFurnitureItem | null;
  anchor?: AnchorState | null;
  canEdit: boolean;
  editHint?: string;
}>();

const emit = defineEmits<{
  layer: [value: PictureLayer];
  nodeAttrs: [patch: Record<string, unknown>];
  item: [patch: Partial<PageFurnitureItem>];
  corner: [value: string | undefined];
  stays: [value: string | undefined];
  pick: [];
  replace: [src: string];
  edit: [tool?: WorkbenchTool];
  remove: [];
}>();

const showUpload = ref(false);

/** The picture's own values, whichever home it is in: what the quick edits read. */
const values = computed<Record<string, unknown> | null>(() => nodeAttrs ?? item?.props ?? null);

/** A quick edit is written to the image node as attrs, or to the art item as props. */
function onTreatment(patch: TreatmentPatch) {
  if (nodeAttrs) emit("nodeAttrs", patch);
  else if (item) emit("item", { props: mergeTreatmentPatch(item.props, patch) as PageFurnitureItem["props"] });
}
function onUploaded(src: string | null) {
  if (!src) return;
  showUpload.value = false;
  emit("replace", src);
}

const layerOptions: SegmentedOption<PictureLayer>[] = [
  { value: "under", label: "Behind the text", tooltip: "On the page, under the words" },
  { value: "over", label: "In front", tooltip: "On the page, over the words" },
  { value: "text", label: "In the text", tooltip: "Part of the text: it moves as you write" },
];

const sizeOptions: SegmentedOption<string>[] = IMAGE_SIZES.map((s) => ({
  value: String(s.w),
  label: s.label,
  tooltip: `${s.w} px wide`,
}));
const sizeValue = computed(() => String(nodeAttrs?.width ?? ""));

const BLEND_OPTIONS: SegmentedOption<PictureBlend>[] = [
  { value: "paper", label: "Printed into the paper", tooltip: "The paper's grain and colour show through, as if printed on it" },
  { value: "top", label: "On top", tooltip: "Drawn as it is, over the paper" },
];
const blendValue = computed<PictureBlend>(() => (nodeAttrs ? imageBlend(nodeAttrs) : item ? artBlend(item) : "top"));
function setBlend(blend: PictureBlend) {
  if (nodeAttrs) emit("nodeAttrs", { blend });
  else if (item) emit("item", { props: { ...item.props, blend } });
}

const ALIGN_OPTIONS: SegmentedOption<string>[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];
const WRAP_OPTIONS: SegmentedOption<string>[] = [
  { value: "inline", label: "None", tooltip: "The picture stands on its own line" },
  { value: "wrapLeft", label: "Left", tooltip: "Wrap left: text flows around its right edge" },
  { value: "wrapRight", label: "Right", tooltip: "Wrap right: text flows around its left edge" },
];
const wrapValue = computed(() => String(nodeAttrs?.layoutMode ?? "inline"));
const wrapped = computed(() => wrapValue.value === "wrapLeft" || wrapValue.value === "wrapRight");
// Alignment only means something when the picture is not wrapped: wrapping overrides it.
const alignValue = computed(() => (wrapped.value ? "" : String(nodeAttrs?.dataAlign ?? "right")));
</script>
