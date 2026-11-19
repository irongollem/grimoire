<template>
  <!-- How the app plays this creature's turn (#1203), read out on a sheet nobody edits here. What is shown is the
       whole profile, the authored fields and the derived ones alike, because that is what the turn is chosen by.
       The body only: the host wraps it in its own `TraitList title="How it fights"`, so a host that loads this late
       (the NPC page) does not make the box itself a file of its own. -->
  <p>{{ sentences.join(" ") }}</p>
  <p v-if="profile.note !== null" class="mt-2 italic">{{ profile.note }}</p>
  <p class="mt-2 text-caption text-muted-foreground">Used when the app plays this creature's turn for you.</p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { tacticsSentences } from "@/components/common/statblock/tacticsWords";
import { tacticalProfile } from "@/rules/fight/tactics/profile";
import type { MonsterStatBlock, MonsterType } from "@/types/monster.types";
import type { StatBlock } from "@/types/npc.types";

const { sb, creatureType } = defineProps<{
  sb: MonsterStatBlock | StatBlock;
  /** The monster row's type, which decides whether it is fearless by default; null for an NPC. */
  creatureType: MonsterType | null;
}>();

const profile = computed(() => tacticalProfile(sb, creatureType));
const sentences = computed(() => tacticsSentences(profile.value));
</script>
