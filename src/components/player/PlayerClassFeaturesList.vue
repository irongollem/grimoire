<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
        {{ group.class_name || 'Class' }} Features
        <span v-if="group.subclass_name" class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ group.subclass_name }})</span>
      </p>
    </div>

    <div
      v-if="Object.keys(group.featuresByLevel).length === 0 && Object.keys(group.subclassFeaturesByLevel).length === 0"
      class="px-4 py-3"
    >
      <p class="font-fell text-sm text-muted-foreground italic">No class features defined yet.</p>
    </div>

    <div v-else class="divide-y divide-border">
      <!-- Class features -->
      <template v-for="(features, lvl) in group.featuresByLevel" :key="lvl">
        <div
          v-for="feat in features"
          :key="`${group.class_name}-${lvl}-${featureName(feat)}`"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-3 cursor-pointer"
            @click="isSpellcasting(featureName(feat)) ? emit('navigate-spells') : featureDescription(feat) && toggleExpanded(`class-${group.class_name}-${lvl}-${featureName(feat)}`)"
          >
            <span class="text-label md:text-sm text-muted-foreground w-10 shrink-0">Lvl {{ lvl }}</span>
            <span class="font-fell text-sm text-foreground flex-1">{{ featureName(feat) }}</span>
            <IconGenerate v-if="isSpellcasting(featureName(feat))" class="h-3 w-3 text-primary/60 shrink-0" />
            <IconChevronDown
              v-else-if="featureDescription(feat)"
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`class-${group.class_name}-${lvl}-${featureName(feat)}`) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="!isSpellcasting(featureName(feat)) && featureDescription(feat) && expanded.has(`class-${group.class_name}-${lvl}-${featureName(feat)}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2"
          >
            <RichTextViewer :content="featureDescription(feat)!" />
          </div>
        </div>
      </template>
      <!-- Subclass features inline (subtle tint + "Subclass" badge) -->
      <template v-for="(subFeats, lvl) in group.subclassFeaturesByLevel" :key="`sub-${lvl}`">
        <div
          v-for="feat in subFeats"
          :key="`${group.class_name}-sub-${lvl}-${featureName(feat)}`"
          class="px-4 py-2.5 bg-primary/3"
        >
          <button
            class="w-full text-left flex items-center gap-3 cursor-pointer"
            @click="isSpellcasting(featureName(feat)) ? emit('navigate-spells') : featureDescription(feat) && toggleExpanded(`sub-${group.class_name}-${lvl}-${featureName(feat)}`)"
          >
            <span class="text-label md:text-sm text-muted-foreground w-10 shrink-0">Lvl {{ lvl }}</span>
            <span class="font-fell text-sm text-foreground flex-1">{{ featureName(feat) }}</span>
            <span class="text-label md:text-sm text-primary/60 shrink-0 mr-1">Subclass</span>
            <IconGenerate v-if="isSpellcasting(featureName(feat))" class="h-3 w-3 text-primary/60 shrink-0" />
            <IconChevronDown
              v-else-if="featureDescription(feat)"
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`sub-${group.class_name}-${lvl}-${featureName(feat)}`) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="!isSpellcasting(featureName(feat)) && featureDescription(feat) && expanded.has(`sub-${group.class_name}-${lvl}-${featureName(feat)}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2"
          >
            <RichTextViewer :content="featureDescription(feat)!" />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconChevronDown, IconGenerate } from "@/lib/icons";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { featureName, featureDescription, type FeatureEntry } from "@/levelup/types";

export interface ClassFeatureGroup {
  class_name: string;
  subclass_name: string | null;
  levels: number;
  featuresByLevel: Record<number, FeatureEntry[]>;
  subclassFeaturesByLevel: Record<number, FeatureEntry[]>;
}

const { group } = defineProps<{ group: ClassFeatureGroup }>();

const emit = defineEmits<{ "navigate-spells": [] }>();

function isSpellcasting(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("spellcasting") || n === "pact magic";
}

const expanded = ref(new Set<string>());
function toggleExpanded(name: string) {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
  expanded.value = new Set(expanded.value);
}
</script>
