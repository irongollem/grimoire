<template>
  <AiGeneratedBadge :variant="inline ? 'inline' : 'chip'" :provenance="record" :corner="corner" />
</template>

<script setup lang="ts">
/*
Image badge: looks the picture up by its URL and hands the record to
`AiGeneratedBadge`. Image disclosure goes by URL because a row's own
`ai_provenance` describes the row's drafted prose, not its picture, and one
stored image can be shared by several rows. The registry (#935) is keyed by
storage object, so it answers for the image itself.

`src` may be undefined or null (data still loading, optional field) and
change later; the lookup follows it. Nothing renders until the image has a
record. Same host contract as the chip: the host must be `relative` (unless
`inline`), and a host `class` (e.g. `bottom-9!`) falls through to the chip, so keep a single
root here.
*/
import { useImageProvenance } from "@/composables/ai/useImageProvenance";
import { useAiLabelPrefs } from "@/composables/ai/useAiLabelPrefs";
import AiGeneratedBadge from "./AiGeneratedBadge.vue";

const { src, corner = "right", inline = false } = defineProps<{
  src: string | null | undefined;
  /** Bottom corner the chip sits in; `left` for hosts whose right corner is taken. */
  corner?: "left" | "right";
  /** Render in the normal flow instead of as an overlay; the host then needs no `relative`. */
  inline?: boolean;
}>();

// With labels off there is nothing to show, so skip the lookup too.
const { showAiLabels } = useAiLabelPrefs();
const record = useImageProvenance(() => (showAiLabels.value ? src : null));
</script>
