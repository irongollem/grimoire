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
      <NpcInventorySection :npc-id="npc.id" :npc-name="getNpcDisplayName(npc)" />
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

    <!-- Voice tab -->
    <div v-else-if="activeTab === 'voice'">
      <NpcVoiceCoach :npc="npc" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import TabBar from "@/components/common/TabBar.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import StatBlockPanel from "@/components/common/StatBlockPanel.vue";
import TraitList from "@/components/common/TraitList.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import NpcInventorySection from "@/components/npcs/NpcInventorySection.vue";
import NpcRelationsSection from "@/components/npcs/NpcRelationsSection.vue";
import NpcPcNotesSection from "@/components/npcs/NpcPcNotesSection.vue";
import NpcVoiceCoach from "@/components/npcs/NpcVoiceCoach.vue";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import type { Npc } from "@/types/npc.types";

defineProps<{ npc: Npc }>();

const TABS = [
  { key: 'lore',      label: 'Lore' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'relations', label: 'Relations' },
  { key: 'combat',    label: 'Combat' },
  { key: 'voice',     label: 'Voice' },
] as const;
type TabKey = typeof TABS[number]['key'];
const TABS_BAR = TABS.map(t => ({ id: t.key, label: t.label }));

const activeTab = ref<TabKey>('lore');
</script>
