<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap text-label font-bold"
    :class="TONE[mark]"
    :data-mark="mark"
  >
    <span aria-hidden="true" class="size-2 shrink-0 rotate-45 border" :class="SHAPE[mark]" />
    {{ KNOWLEDGE_LABEL[mark] }}
  </span>
</template>

<script setup lang="ts">
/**
 * Who knows a truth, as a shape and a word, never colour alone (frame 03): a filled diamond for all, a half one for
 * some, a hollow one for a secret.
 */
import { KNOWLEDGE_LABEL } from "@/lib/canon/canonParts";
import type { KnowledgeMark } from "@/types/canon.types";

const { mark } = defineProps<{ mark: KnowledgeMark }>();

const TONE: Record<KnowledgeMark, string> = {
  all: "text-tone-success",
  some: "text-tone-info",
  secret: "text-foreground",
};

const SHAPE: Record<KnowledgeMark, string> = {
  all: "border-current bg-current",
  some: "border-current bg-[linear-gradient(135deg,currentColor_50%,transparent_50%)]",
  secret: "border-[1.5px] border-current bg-transparent",
};
</script>
