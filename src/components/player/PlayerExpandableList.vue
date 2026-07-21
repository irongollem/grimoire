<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">{{ title }}</p>
    </div>
    <div class="divide-y divide-border">
      <div v-for="item in items" :key="item.name" class="px-4 py-2.5">
        <button
          class="w-full text-left flex items-center gap-2 cursor-pointer"
          @click="toggleExpanded(item.name)"
        >
          <span class="font-fell text-sm text-foreground flex-1">{{ item.name }}</span>
          <span
            v-for="badge in item.badges ?? []"
            :key="badge.label"
            class="text-label rounded px-1.5 py-0.5 shrink-0 border"
            :class="badge.variant === 'primary'
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-muted/50 text-muted-foreground border-border'"
          >{{ badge.label }}</span>
          <IconChevronDown
            class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
            :class="expanded.has(item.name) ? 'rotate-180' : ''"
          />
        </button>
        <div
          v-if="expanded.has(item.name)"
          class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
        >
          <p v-if="item.subtext" class="font-fell text-xs text-primary/70 mb-1 italic">{{ item.subtext }}</p>
          {{ item.description }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconChevronDown } from "@/lib/icons";

export interface ExpandableItem {
  name: string;
  description: string;
  subtext?: string;
  badges?: { label: string; variant?: "primary" | "muted" }[];
}

const { title, items } = defineProps<{ title: string; items: ExpandableItem[] }>();

const expanded = ref(new Set<string>());
function toggleExpanded(key: string) {
  if (expanded.value.has(key)) expanded.value.delete(key);
  else expanded.value.add(key);
  expanded.value = new Set(expanded.value);
}
</script>
