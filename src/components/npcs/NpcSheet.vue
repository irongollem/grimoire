<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
      <!-- Left: portrait -->
      <div class="flex flex-col gap-3 lg:sticky lg:top-6">
        <FocalImage
          v-if="npc.portrait_url"
          :src="npc.portrait_url"
          :focal-point="npc.portrait_focal_point"
          format="portrait"
          class="w-full rounded-lg overflow-hidden flex-1 min-h-0 max-h-[75vh]"
        />
        <!-- Status + relationship badges -->
        <div class="flex flex-wrap gap-1">
          <span
            class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize"
            >{{ npc.status }}</span
          >
          <span
            class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize"
            >{{ npc.relationship }}</span
          >
        </div>
        <div v-if="npc.tags?.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in npc.tags"
            :key="tag"
            class="font-cinzel text-[10px] tracking-wider bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span
          >
        </div>
      </div>

      <!-- Right: details -->
      <div class="flex flex-col gap-4">
        <!-- Identity -->
        <div class="border-b border-primary/30 pb-2">
          <p class="font-fell text-sm italic text-muted-foreground">
            <span v-if="npc.race">{{ npc.race }}</span>
            <span v-if="npc.race && npc.occupation"> · </span>
            <span v-if="npc.occupation">{{ npc.occupation }}</span>
            <span v-if="npc.alignment"> · {{ npc.alignment }}</span>
            <span v-if="npc.age"> · Age {{ npc.age }}</span>
          </p>
        </div>

        <!-- Narrative fields -->
        <div v-if="npc.appearance" class="flex flex-col gap-1">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-primary uppercase"
          >
            Appearance
          </h3>
          <RichTextViewer :content="npc.appearance" />
        </div>
        <div v-if="npc.personality" class="flex flex-col gap-1">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-primary uppercase"
          >
            Personality
          </h3>
          <RichTextViewer :content="npc.personality" />
        </div>
        <div v-if="npc.backstory" class="flex flex-col gap-1">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-primary uppercase"
          >
            Backstory
          </h3>
          <RichTextViewer :content="npc.backstory" />
        </div>

        <!-- Stat block (if present) -->
        <template v-if="npc.stat_block">
          <div class="border-t border-border pt-4 flex flex-col gap-4">
            <h3
              class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              Stat Block
            </h3>
            <StatBlockPanel :sb="npc.stat_block" />
            <TraitList
              title="Special Abilities"
              :traits="npc.stat_block.special_abilities"
            />
            <TraitList title="Actions" :traits="npc.stat_block.actions" />
            <TraitList
              title="Legendary Actions"
              :traits="npc.stat_block.legendary_actions"
            />
          </div>
        </template>

        <!-- DM notes -->
        <div v-if="npc.notes" class="flex flex-col gap-1">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase"
          >
            DM Notes
          </h3>
          <RichTextViewer :content="npc.notes" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import TraitList from "@/components/common/TraitList.vue";
import type { Npc } from "@/types/npc.types";

defineProps<{ npc: Npc }>();
</script>
