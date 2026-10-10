<template>
  <span class="inline-flex items-center gap-1.5 text-eyebrow font-bold uppercase" :class="npcRelationshipText(relationship)">
    <i class="inline-block h-1.5 w-1.5 rotate-45" :class="npcRelationshipBg(relationship)" aria-hidden="true" />
    {{ relationship }}
  </span>
</template>

<script setup lang="ts">
import { npcRelationshipBg, npcRelationshipText } from "@/lib/npcDisplay";
import type { NpcRelationship } from "@/types/npc.types";

/** How an NPC or faction regards the party: a small coloured diamond and the word. */
defineProps<{ relationship: NpcRelationship }>();
</script>
