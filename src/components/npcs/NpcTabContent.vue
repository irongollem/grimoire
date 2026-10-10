<template>
  <!--
    No identity line here. The only host is the detail modal, whose header
    carries it — and carries it better, since the header does not scroll away
    from you halfway down a backstory.
  -->
  <div class="flex flex-col gap-4">
    <!-- Tabs -->
    <TabBar :tabs="TABS_BAR" v-model="activeTab" />

    <!-- Lore tab -->
    <div v-if="activeTab === 'lore'" class="space-y-4">
      <NpcLoreSections :full="full" />

      <!-- Needs only the id, so it reads alongside the record rather than after it (#999). -->
      <EntityBacklinks :entity-id="npc.id" heading-class="text-label-lg font-bold text-muted-foreground uppercase" />
    </div>

    <!-- With the party tab -->
    <NpcPartyTab v-else-if="activeTab === 'party'" :npc="npc" />

    <!-- Inventory tab -->
    <div v-else-if="activeTab === 'inventory'">
      <NpcInventorySection :npc-id="npc.id" :npc-name="getNpcDisplayName(npc)" />
    </div>

    <!-- Relations tab -->
    <NpcRelationsTab v-else-if="activeTab === 'relations'" :npc-id="npc.id" />

    <!-- Combat tab -->
    <div v-else-if="activeTab === 'combat'" class="space-y-4">
      <template v-if="npc.stat_block">
        <StatBlockPanel :sb="npc.stat_block" :name="npc.name" />
        <TraitList title="Special Abilities" :traits="npc.stat_block.special_abilities" />
        <SpellcastingList :spellcasting="npc.stat_block.spellcasting" />
        <TraitList title="Actions" :traits="npc.stat_block.actions" />
        <TraitList title="Bonus Actions" :traits="npc.stat_block.bonus_actions" />
        <TraitList title="Reactions" :traits="npc.stat_block.reactions" />
        <TraitList title="Legendary Actions" :traits="npc.stat_block.legendary_actions" />
        <TraitList title="Lair Actions" :traits="npc.stat_block.lair_actions" />
      </template>
      <p v-else class="text-body text-muted-foreground italic">No stat block defined for this NPC.</p>
    </div>

    <!-- Voice tab -->
    <div v-else-if="activeTab === 'voice'">
      <!-- The coach reads the prose to write in the NPC's voice, so it waits for the record. -->
      <NpcVoiceCoach v-if="full" :npc="full" />
      <div v-else class="flex min-h-40 items-center justify-center"><BannerLoader class="h-8" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import NpcLoreSections from "@/components/npcs/NpcLoreSections.vue";
import TabBar from "@/components/common/controls/TabBar.vue";
import StatBlockPanel from "@/components/common/statblock/StatBlockPanel.vue";
import TraitList from "@/components/common/statblock/TraitList.vue";
import SpellcastingList from "@/components/common/statblock/SpellcastingList.vue";
import NpcInventorySection from "@/components/npcs/NpcInventorySection.vue";
import NpcPartyTab from "@/components/npcs/NpcPartyTab.vue";
import NpcRelationsTab from "@/components/npcs/NpcRelationsTab.vue";
import NpcVoiceCoach from "@/components/npcs/NpcVoiceCoach.vue";
import EntityBacklinks from "@/components/common/entity/EntityBacklinks.vue";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import type { Npc, NpcListRow } from "@/types/npc.types";

defineProps<{
  /** What the list already knew: everything but the prose. */
  npc: NpcListRow;
  /** The record read by id; absent until it arrives (#999). */
  full?: Npc;
}>();

const TABS = [
  { key: 'lore',      label: 'Lore' },
  { key: 'party',     label: 'With the party' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'relations', label: 'Relations' },
  { key: 'combat',    label: 'Combat' },
  { key: 'voice',     label: 'Voice' },
] as const;
type TabKey = typeof TABS[number]['key'];
const TABS_BAR = TABS.map(t => ({ id: t.key, label: t.label }));

const activeTab = ref<TabKey>('lore');
</script>
