<template>
  <span
    v-if="quality !== 'standard'"
    class="inline-flex shrink-0 items-center rounded border px-1.5 py-0.5"
    :class="[sizeClass, toneClass]"
    :data-quality="quality"
  >{{ QUALITY_LABELS[quality] }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { QUALITY_LABELS } from "@/lib/items/quality";
import type { ItemQuality } from "@/types/inventory.types";

// Standard is the common case and renders nothing. The label is text, so colour is never the only signal.
// A status label, not a control: it is never clicked, so it is a span in the family of SourceBadge and
// AiGeneratedBadge rather than AppButton's tinted variant, which is a button.
const { quality, size = "md" } = defineProps<{ quality: ItemQuality; size?: "sm" | "md" }>();

const sizeClass = computed(() => (size === "sm" ? "text-caption-sm" : "text-label"));

const toneClass = computed(() => {
  switch (quality) {
    case "ruined":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "poor":
      return "border-border text-muted-foreground";
    case "fine":
      return "border-gold-500/40 bg-gold-500/10 text-foreground";
    case "masterwork":
      return "border-gold-500/70 bg-gold-500/20 font-semibold text-foreground";
    default:
      return "";
  }
});
</script>
