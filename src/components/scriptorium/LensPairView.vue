<template>
  <NodeViewWrapper
    as="div"
    data-type="lensPair"
    :data-variant="variant"
    :class="['sc-lens', variant === 'light' && 'sc-lens--light']"
  >
    <div v-if="editable" class="sc-lens-strip" contenteditable="false">
      <span class="sc-lens-strip-title">Lens pair</span>
      <SegmentedControl
        :model-value="variant"
        :options="VARIANT_OPTIONS"
        size="xs"
        variant="ghost"
        @update:model-value="setVariant"
      />
    </div>
    <NodeViewContent class="sc-lens-halves" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { nodeViewProps, NodeViewContent, NodeViewWrapper } from "@tiptap/vue-3";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import type { SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import type { LensVariant } from "@/lib/tiptap/lensPair";

// The galley's chrome around a lens pair (Scriptorium board 03): a header strip
// with the Boxed / Light toggle. The strip exists only in the live editor view,
// never in `renderHTML`, so it cannot reach a printed page.

const props = defineProps({ ...nodeViewProps });

const VARIANT_OPTIONS: SegmentedOption<LensVariant>[] = [
  { value: "boxed", label: "Boxed" },
  { value: "light", label: "Light" },
];

const variant = computed<LensVariant>(() => (props.node.attrs.variant === "light" ? "light" : "boxed"));
const editable = computed(() => props.editor.isEditable);

function setVariant(next: LensVariant) {
  props.updateAttributes({ variant: next });
}
</script>
