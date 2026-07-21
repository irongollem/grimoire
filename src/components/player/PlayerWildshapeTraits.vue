<template>
  <div class="rounded-lg border border-primary/30 bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-primary/80">
        Beast Traits
        <span class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ monster.name }})</span>
      </p>
    </div>
    <div class="divide-y divide-border">
      <div
        v-for="trait in monster.stat_block.special_abilities"
        :key="trait.name"
        class="px-4 py-2.5"
      >
        <button
          class="w-full text-left flex items-center gap-2 cursor-pointer"
          @click="toggleExpanded(`beast-${trait.name}`)"
        >
          <span class="text-body text-foreground flex-1">{{ trait.name }}</span>
          <IconChevronDown class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0" :class="expanded.has(`beast-${trait.name}`) ? 'rotate-180' : ''" />
        </button>
        <div v-if="expanded.has(`beast-${trait.name}`)" class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 text-body text-muted-foreground leading-relaxed">
          {{ trait.description }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconChevronDown } from "@/lib/icons";
import type { Monster } from "@/types/monster.types";

const { monster } = defineProps<{ monster: Monster }>();

const expanded = ref(new Set<string>());
function toggleExpanded(name: string) {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
  expanded.value = new Set(expanded.value);
}
</script>
