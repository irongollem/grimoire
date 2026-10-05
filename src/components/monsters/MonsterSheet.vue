<template>
  <div class="flex flex-col gap-6">
    <!-- Top: portrait | stat block | lore -->
    <div class="grid grid-cols-1 lg:grid-cols-[12.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-6">
      <!-- Left: portrait.
           `max-h-112` is a fixed cap rather than the `75vh` it replaces.
           The viewport measurement only ever bound below `lg`, where the
           portrait spans the full width — and it bound badly once this sheet
           started appearing in a modal, where three quarters of the viewport is
           most of the panel and the stat block fell off the bottom. At `lg` the
           12.5rem column decides the height anyway, so nothing changes there. -->
      <div class="flex flex-col gap-3">
        <FocalImage
          :src="monster.image_url"
          :focal-point="monster.portrait_focal_point"
          format="portrait"
          :lightbox="true"
          :placeholder="placeholderUrl('monster')"
          class="w-full rounded-lg overflow-hidden flex-1 min-h-0 max-h-112"
        />
        <div v-if="monster.tags?.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in monster.tags"
            :key="tag"
            class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span
          >
        </div>
        <p v-if="monster.habitat" class="text-caption text-muted-foreground italic">
          Habitat: {{ monster.habitat }}
        </p>
        <RouterLink
          v-if="lairLocation"
          :to="placeRoute(lairLocation.id)"
          class="text-caption text-muted-foreground italic hover:text-foreground hover:underline transition-colors"
        >
          Lair: {{ lairLocation.name }}
        </RouterLink>
        <p v-if="monster.source" class="text-caption text-muted-foreground italic">
          Source: {{ monster.source }}
        </p>
      </div>

      <!-- Stat block, and beside it what the creature is.
           No identity line here. Both hosts — the detail modal and the admin
           art preview — put it in their header, where it stays put instead of
           scrolling away from you halfway down a legendary action. `monsterIdentityLine`
           composes it so the two cannot word it differently. -->
      <StatBlockPanel :sb="monster.stat_block" :name="monster.name" class="self-start" />

      <!-- Lore sits beside the numbers, not under every action: it is the
           first thing a DM reads about a creature, and in a column it keeps a
           readable measure where full width would run past 100 characters.
           No "Description" label; prose beside a stat block needs none.
           Only the portrait column stretches to the row, so the picture ends
           where the stat block does; the two text columns keep their height. -->
      <div class="flex flex-col gap-4 self-start">
        <RichTextViewer v-if="description" :content="description" class="lore" />
        <div v-if="monster.notes" class="flex flex-col gap-1">
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
            DM Notes
          </h3>
          <RichTextViewer :content="monster.notes" />
        </div>
        <p v-if="!description && !monster.notes" class="text-body italic text-muted-foreground">
          No lore recorded for this monster.
        </p>
      </div>
    </div>

    <!-- What it does, each kind of move in its own box. CSS columns pack the
         boxes so a vampire's six traits do not leave a hole beside two
         reactions; `break-inside-avoid` on each box keeps it whole, and the
         columns fill top to bottom, so reading order stays the book's. -->
    <div class="columns-1 lg:columns-2 gap-4 *:mb-4 -mb-4">
      <TraitList title="Special Abilities" :traits="monster.stat_block.special_abilities" />
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
      <TraitList title="Legendary Actions" :traits="monster.stat_block.legendary_actions" />
      <TraitList
        title="Lair Actions"
        :traits="(monster.stat_block as MonsterStatBlock).lair_actions"
      />
    </div>

    <!-- Featured in encounters -->
    <div v-if="featuredIn.length" class="flex flex-col gap-2">
      <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
        Featured In
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="enc in featuredIn"
          :key="enc.id"
          :to="`/encounters/${enc.id}`"
          class="inline-flex items-center gap-1 text-label px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
          :class="enc.is_finished ? 'opacity-50' : ''"
        >
          <IconEncounter class="h-2.5 w-2.5 shrink-0" />{{ enc.name }}
        </RouterLink>
      </div>
    </div>

    <!-- Loot tables -->
    <div v-if="lootTables.length" class="flex flex-col gap-2">
      <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
        Loot Tables
      </h3>
      <div class="flex flex-wrap gap-1.5">
        <RouterLink
          v-for="lt in lootTables"
          :key="lt.id"
          :to="`/loot-tables/${lt.id}`"
          class="inline-flex items-center gap-1 text-label px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
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
import { useEncountersByMonster } from "@/composables/encounters/useEncounters";
import { useMonsterDescription } from "@/composables/monsters/useMonsterDescription";
import { useMonsterLootTables } from "@/composables/dungeon-features/useLootTables";
import { useLocationTree } from "@/composables/locations/useLocations";
import { placeRoute } from "@/lib/locations/placeRoute";
import type { Monster, MonsterStatBlock } from "@/types/monster.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const props = defineProps<{ monster: Monster }>();

const description = useMonsterDescription(() => props.monster);

const featuredIn = useEncountersByMonster(computed(() => props.monster.id));
const lootTables = useMonsterLootTables(computed(() => props.monster.id));

// Lair link resolves against the active campaign's location tree; a lair set
// in another campaign simply doesn't render here.
const { locationOptions } = useLocationTree();
const lairLocation = computed(() =>
  props.monster.lair_location_id
    ? (locationOptions.value.find((l) => l.id === props.monster.lair_location_id) ?? null)
    : null,
);
</script>
