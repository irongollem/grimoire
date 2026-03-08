<template>
  <CardNpcFront v-if="subject.kind === 'npc'" :data="subject.data" />
  <CardMonsterFront v-else-if="subject.kind === 'monster'" :data="subject.data" />
  <CardItemFront v-else-if="subject.kind === 'item'" :data="subject.data" />
  <CardSpellFront v-else-if="subject.kind === 'spell'" :data="subject.data" />
</template>

<script setup lang="ts">
import type { CardSubject } from "@/types/card.types";
import CardNpcFront from "./CardNpcFront.vue";
import CardMonsterFront from "./CardMonsterFront.vue";
import CardItemFront from "./CardItemFront.vue";
import CardSpellFront from "./CardSpellFront.vue";

defineProps<{ subject: CardSubject }>();
</script>
