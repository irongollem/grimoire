<template>
  <div v-if="traits?.length" class="flex flex-col gap-2 font-stat">
    <h3 class="text-[20px] font-normal text-primary border-b border-primary/30 pb-1">
      {{ title }}
    </h3>
    <div v-for="(trait, i) in traits" :key="i" class="text-[15px] leading-relaxed">
      <span class="font-semibold italic">{{ trait.name }}. </span>
      <RichTextViewer v-if="isRichText(trait.description)" :content="trait.description" class="inline" />
      <span v-else>{{ trait.description }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import RichTextViewer from "@/components/common/RichTextViewer.vue";

defineProps<{
  title: string;
  traits: Array<{ name: string; description: string }> | undefined;
}>();

function isRichText(value: string): boolean {
  try { JSON.parse(value); return true; } catch { return false; }
}
</script>
