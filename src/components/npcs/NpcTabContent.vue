<template>
  <div class="flex flex-col gap-4">
    <!-- Identity -->
    <div class="border-b border-primary/30 pb-2">
      <p class="text-body italic text-muted-foreground">
        <span v-if="npc.race">{{ npc.race }}</span>
        <span v-if="npc.race && npc.occupation"> · </span>
        <span v-if="npc.occupation">{{ npc.occupation }}</span>
        <span v-if="npc.alignment"> · {{ npc.alignment }}</span>
        <span v-if="npc.age"> · Age {{ npc.age }}</span>
      </p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-0 border-b border-border">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        class="px-4 py-2 text-label-lg font-semibold border-b-2 transition-colors -mb-px"
        :class="activeTab === tab.key
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <!-- Lore tab -->
    <div v-if="activeTab === 'lore'" class="space-y-4">
      <div v-if="npc.appearance" class="flex flex-col gap-1">
        <h3 class="text-label-lg font-bold text-primary uppercase">Appearance</h3>
        <RichTextViewer :content="npc.appearance" />
      </div>
      <div v-if="npc.personality" class="flex flex-col gap-1">
        <h3 class="text-label-lg font-bold text-primary uppercase">Personality</h3>
        <RichTextViewer :content="npc.personality" />
      </div>
      <div v-if="npc.backstory" class="flex flex-col gap-1">
        <h3 class="text-label-lg font-bold text-primary uppercase">Backstory</h3>
        <RichTextViewer :content="npc.backstory" />
      </div>
      <div v-if="npc.notes" class="flex flex-col gap-1">
        <h3 class="text-label-lg font-bold text-muted-foreground uppercase">DM Notes</h3>
        <RichTextViewer :content="npc.notes" />
      </div>
      <p v-if="!npc.appearance && !npc.personality && !npc.backstory && !npc.notes"
        class="text-body text-muted-foreground italic">
        No lore recorded for this NPC.
      </p>
    </div>

    <!-- Inventory tab -->
    <div v-else-if="activeTab === 'inventory'">
      <NpcInventorySection :npc-id="npc.id" :npc-name="npc.name" />
    </div>

    <!-- Relations tab -->
    <!-- Surfacing NpcRelationsSection here so DMs can see (and tweak)
         relations from the view mode sheet — previously relations were only
         visible after clicking into the edit form. See #168. The component
         handles its own CRUD so embedding it here doesn't require flipping
         the sheet into "edit mode". -->
    <div v-else-if="activeTab === 'relations'" class="space-y-4">
      <NpcRelationsSection :npc-id="npc.id" />
      <!-- Party-member connections (npc_pc_notes) — same #168 reasoning as
           NpcRelationsSection above: previously edit-form-only. -->
      <NpcPcNotesSection :npc-id="npc.id" />
    </div>

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
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import TraitList from "@/components/common/TraitList.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import NpcInventorySection from "@/components/npcs/NpcInventorySection.vue";
import NpcRelationsSection from "@/components/npcs/NpcRelationsSection.vue";
import NpcPcNotesSection from "@/components/npcs/NpcPcNotesSection.vue";
import type { Npc } from "@/types/npc.types";

defineProps<{ npc: Npc }>();

const TABS = [
  { key: 'lore',      label: 'Lore' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'relations', label: 'Relations' },
  { key: 'combat',    label: 'Combat' },
] as const;
type TabKey = typeof TABS[number]['key'];

const activeTab = ref<TabKey>('lore');
</script>
