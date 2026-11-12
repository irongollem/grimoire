<template>
  <div data-testid="panel-decoration">
    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">{{ kindLabel }}</h2>
      <p class="text-caption italic text-muted-foreground">Drag the decoration on the page to move it; drag its corner to resize.</p>
    </PanelSection>

    <PanelSection title="Look">
      <template v-if="item.kind === 'watercolor'">
        <PanelField label="Variant">
          <AppInput v-model="variantModel" type="number" :min="1" :max="WATERCOLOR_COUNT" tone="default" size="caption" :block="false" class="w-20" />
        </PanelField>
        <PanelField label="Tint">
          <ColorInput aria-label="Tint" :model-value="strProp(item.props, 'color', '#2a2018')" @update:model-value="(color) => patchProps({ color })" />
        </PanelField>
        <PanelRange label="Opacity" :model-value="numProp(item.props, 'opacity', 80)" :min="5" :max="100" @update:model-value="patchProps({ opacity: $event })" />
      </template>

      <template v-else-if="item.kind === 'watermark'">
        <PanelField label="Text">
          <AppInput v-model="watermarkText" tone="default" size="caption" />
        </PanelField>
        <PanelRange label="Rotation" :model-value="numProp(item.props, 'rotation', -30)" :min="-90" :max="90" @update:model-value="patchProps({ rotation: $event })" />
        <PanelRange label="Opacity" :model-value="numProp(item.props, 'opacity', 15)" :min="2" :max="100" @update:model-value="patchProps({ opacity: $event })" />
      </template>

      <template v-else-if="item.kind === 'artistCredit'">
        <PanelField label="Artist">
          <AppInput v-model="artistName" placeholder="Art by…" tone="default" size="caption" />
        </PanelField>
        <PanelField label="Corner">
          <SegmentedControl
            :model-value="strProp(item.props, 'position', 'bottom-right')"
            :options="CREDIT_CORNERS"
            size="xs"
            wrap
            block
            @update:model-value="(position) => patchProps({ position })"
          />
        </PanelField>
      </template>
    </PanelSection>

    <PanelSection title="On the page">
      <PlacementFields :item="item" :anchor="anchor" @patch="emit('patch', $event)" @corner="emit('corner', $event)" @stays="emit('stays', $event)" />
      <PanelField label="Layer">
        <SegmentedControl :model-value="item.z" :options="LAYERS" size="xs" block @update:model-value="(z) => emit('patch', { z })" />
      </PanelField>
    </PanelSection>

    <PanelSection>
      <AppButton variant="destructive" size="sm" :icon="IconDelete" label="Remove decoration" @click="emit('remove')" />
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/**
 * A watercolour, a watermark or an artist credit (#1176, frame 05): every
 * option the floating inspector had, in the panel. A picture placed on the page
 * is not here; it is a Picture, whose Layer control covers behind and in front.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ColorInput from "@/components/common/controls/ColorInput.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelRange from "@/scriptorium/components/panel/PanelRange.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import PlacementFields from "@/scriptorium/components/panel/PlacementFields.vue";
import { WATERCOLOR_COUNT } from "@/data/watercolorAssets";
import { numProp, strProp } from "@/scriptorium/lib/panel/propReaders";
import type { AnchorState } from "@/scriptorium/composables/useEditorPictures";
import type { PageFurnitureItem } from "@/scriptorium/types";
import { IconDelete } from "@/lib/icons";

const { item } = defineProps<{ item: PageFurnitureItem; anchor: AnchorState }>();
const emit = defineEmits<{
  patch: [patch: Partial<PageFurnitureItem>];
  corner: [value: string | undefined];
  stays: [value: string | undefined];
  remove: [];
}>();

const KIND_LABELS: Record<PageFurnitureItem["kind"], string> = {
  watercolor: "Watercolour",
  watermark: "Watermark",
  artistCredit: "Artist credit",
  art: "Picture",
};
const kindLabel = computed(() => KIND_LABELS[item.kind]);

const CREDIT_CORNERS: SegmentedOption<string>[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];
const LAYERS: SegmentedOption<"under" | "over">[] = [
  { value: "under", label: "Behind the text" },
  { value: "over", label: "In front" },
];

function patchProps(p: Record<string, string | number>) {
  emit("patch", { props: { ...item.props, ...p } });
}

// AppInput's model is required; these bridge it onto the item's props bag.
const variantModel = computed<number | null>({
  get: () => numProp(item.props, "variant", 1),
  set: (v) => patchProps({ variant: Math.max(1, Math.min(WATERCOLOR_COUNT, Math.round(v ?? 1))) }),
});
const watermarkText = computed({
  get: () => strProp(item.props, "text", "DRAFT"),
  set: (v: string) => patchProps({ text: v }),
});
const artistName = computed({
  get: () => strProp(item.props, "artistName", ""),
  set: (v: string) => patchProps({ artistName: v }),
});
</script>
