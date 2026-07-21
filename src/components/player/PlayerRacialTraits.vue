<template>
  <div
    v-for="group in groups"
    :key="group.heading"
    class="rounded-lg border border-border bg-card overflow-hidden"
  >
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">
        {{ group.heading }}
        <span class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ group.subheading }})</span>
      </p>
    </div>
    <div class="divide-y divide-border">
      <div
        v-for="trait in group.traits"
        :key="trait.name"
        class="px-4 py-2.5"
      >
        <button
          class="w-full text-left flex items-center gap-2"
          :class="trait.description ? 'cursor-pointer' : 'cursor-default'"
          @click="trait.description && toggleExpanded(`${group.heading}-${trait.name}`)"
        >
          <span class="font-fell text-sm text-foreground flex-1">{{ trait.name }}</span>
          <IconChevronDown
            v-if="trait.description"
            class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
            :class="expanded.has(`${group.heading}-${trait.name}`) ? 'rotate-180' : ''"
          />
        </button>
        <div
          v-if="trait.description && expanded.has(`${group.heading}-${trait.name}`)"
          class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
        >
          <RichTextViewer :content="trait.description" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconChevronDown } from "@/lib/icons";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

export interface TraitGroup {
  heading: string;
  subheading: string;
  traits: { name: string; description?: string | null }[];
}

const { groups } = defineProps<{ groups: TraitGroup[] }>();

const expanded = ref(new Set<string>());
function toggleExpanded(key: string) {
  if (expanded.value.has(key)) expanded.value.delete(key);
  else expanded.value.add(key);
  expanded.value = new Set(expanded.value);
}
</script>
