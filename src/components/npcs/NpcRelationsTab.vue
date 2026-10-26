<template>
  <!--
    Everything that ties this NPC to someone else, in one place for both hosts:
    the desktop sheet's Relations tab and the mobile sheet's Relations accordion.
    What each player character knows lives on the "With the party" tab, not here.

    Kin is the Family block above; every other tie, factions included, is the one
    Connections block (#1084), where a membership keeps its role and status.
  -->
  <div class="space-y-4">
    <!-- Kin first (#1083): parents, spouse, siblings and children, above the bonds that are not blood. -->
    <FamilyBlock :person="personKey('npc', npcId)" />

    <!-- One block for people, factions, places, deities, items and quests (#1084). -->
    <ConnectionsSection :subject="{ kind: 'npc', id: npcId }" :subject-name="npcName" />

    <!-- What this NPC owes the party (#853, npc_favors) — written by the
         owe_favor quest consequence, or added here by hand. -->
    <NpcFavorsSection :npc-id="npcId" />
  </div>
</template>

<script setup lang="ts">
import FamilyBlock from "@/components/kinship/FamilyBlock.vue";
import { personKey } from "@/lib/kinship/keys";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import NpcFavorsSection from "@/components/npcs/NpcFavorsSection.vue";

const { npcId, npcName } = defineProps<{ npcId: string; npcName: string }>();
</script>
