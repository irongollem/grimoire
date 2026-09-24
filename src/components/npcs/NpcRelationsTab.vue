<template>
  <!--
    Everything that ties this NPC to someone else, in one place for both hosts:
    the desktop sheet's Relations tab and the mobile sheet's Relations accordion.
    They used to list their sections separately, and the phone had drifted down
    to NPC connections alone — no factions, party connections or favours.

    Factions are a first-class relation here, not a chip under the portrait: that
    column is for at-a-glance tags, and a membership carries a role and a status
    the DM edits in place.
  -->
  <div class="space-y-4">
    <NpcRelationsSection :npc-id="npcId" />

    <section class="w-full">
      <div class="text-heading-sm font-bold text-foreground mb-1">Factions</div>
      <div class="gold-divider mb-3" />
      <NpcFactionsSection :npc-id="npcId" />
    </section>

    <!-- Party-member connections (npc_pc_notes) — previously edit-form-only, #168. -->
    <section class="w-full">
      <div class="text-heading-sm font-bold text-foreground mb-1">Party connections</div>
      <div class="gold-divider mb-3" />
      <NpcPcNotesSection :npc-id="npcId" />
    </section>

    <!-- What this NPC owes the party (#853, npc_favors) — written by the
         owe_favor quest consequence, or added here by hand. -->
    <NpcFavorsSection :npc-id="npcId" />
  </div>
</template>

<script setup lang="ts">
import NpcRelationsSection from "@/components/npcs/NpcRelationsSection.vue";
import NpcFactionsSection from "@/components/factions/NpcFactionsSection.vue";
import NpcPcNotesSection from "@/components/npcs/NpcPcNotesSection.vue";
import NpcFavorsSection from "@/components/npcs/NpcFavorsSection.vue";

const { npcId } = defineProps<{ npcId: string }>();
</script>
