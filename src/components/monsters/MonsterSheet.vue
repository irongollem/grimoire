<template>
  <div class="flex flex-col gap-6">
    <!-- Top: portrait left + stat block right -->
    <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
      <!-- Left: portrait -->
      <div class="flex flex-col gap-3">
        <FocalImage
          :src="monster.image_url"
          :focal-point="monster.portrait_focal_point"
          format="portrait"
          :lightbox="true"
          placeholder="/assets/placeholders/monster.webp"
          class="w-full rounded-lg overflow-hidden flex-1 min-h-0 max-h-[75vh]"
        />
        <div v-if="monster.tags?.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in monster.tags"
            :key="tag"
            class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span
          >
        </div>
        <p v-if="monster.habitat" class="font-fell text-xs text-muted-foreground italic">
          Habitat: {{ monster.habitat }}
        </p>
        <p v-if="monster.source" class="font-fell text-xs text-muted-foreground italic">
          Source: {{ monster.source }}
        </p>
      </div>

      <!-- Right: identity + stat block + two-column traits -->
      <div class="flex flex-col gap-4">
        <!-- Identity header -->
        <div class="border-b border-primary/30 pb-2">
          <p class="font-fell text-sm italic text-muted-foreground capitalize">
            {{ monster.size }} {{ monster.monster_type }}, {{ monster.alignment }}
          </p>
        </div>

        <!-- Two-column: stat block left, actions right -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <!-- Left: stat block panel -->
          <StatBlockPanel :sb="monster.stat_block" />

          <!-- Right: special abilities + actions -->
          <div class="flex flex-col gap-3">
            <TraitList
              title="Special Abilities"
              :traits="monster.stat_block.special_abilities"
            />
            <SpellcastingList :spellcasting="(monster.stat_block as MonsterStatBlock).spellcasting" />
            <TraitList title="Actions" :traits="monster.stat_block.actions" />
            <TraitList
              title="Bonus Actions"
              :traits="(monster.stat_block as MonsterStatBlock).bonus_actions"
            />
            <TraitList
              title="Reactions"
              :traits="(monster.stat_block as MonsterStatBlock).reactions"
            />
            <TraitList
              title="Legendary Actions"
              :traits="monster.stat_block.legendary_actions"
            />
            <TraitList
              title="Lair Actions"
              :traits="(monster.stat_block as MonsterStatBlock).lair_actions"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Description / Notes (below) -->
    <div v-if="monster.description" class="flex flex-col gap-1">
      <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Description
      </h3>
      <RichTextViewer :content="monster.description" />
    </div>
    <div v-if="monster.notes" class="flex flex-col gap-1">
      <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase">
        DM Notes
      </h3>
      <RichTextViewer :content="monster.notes" />
    </div>

    <!-- Featured in encounters -->
    <div v-if="featuredIn.length" class="flex flex-col gap-2">
      <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Featured In
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="enc in featuredIn"
          :key="enc.id"
          :to="`/encounters/${enc.id}`"
          class="inline-flex items-center gap-1 font-cinzel text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
          :class="enc.is_finished ? 'opacity-50' : ''"
        >
          <IconEncounter class="h-2.5 w-2.5 shrink-0" />{{ enc.name }}
        </RouterLink>
      </div>
    </div>

    <!-- Loot tables -->
    <div v-if="lootTables.length" class="flex flex-col gap-2">
      <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase">
        Loot Tables
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="lt in lootTables"
          :key="lt.id"
          :to="`/loot-tables/${lt.id}`"
          class="inline-flex items-center gap-1 font-cinzel text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
        >
          <IconPackage class="h-2.5 w-2.5 shrink-0" />{{ lt.name }}
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconEncounter, IconPackage } from '@/lib/icons';
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import TraitList from "@/components/common/TraitList.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import { useEncountersByMonster } from "@/composables/useEncounters";
import { useMonsterLootTables } from "@/composables/useLootTables";
import type { Monster, MonsterStatBlock } from "@/types/monster.types";

const props = defineProps<{ monster: Monster }>();

const featuredIn = useEncountersByMonster(computed(() => props.monster.id));
const lootTables = useMonsterLootTables(computed(() => props.monster.id));
</script>
