<template>
  <CardTarotNpcFront v-if="subject.kind === 'npc'" :data="subject.data" />
  <CardTarotMonsterFront v-else-if="subject.kind === 'monster'" :data="subject.data" />
  <CardTarotItemFront v-else-if="subject.kind === 'item'" :data="subject.data" />
  <CardTarotSpellFront v-else-if="subject.kind === 'spell'" :data="subject.data" />
</template>

<script setup lang="ts">
import type { CardSubject } from "@/types/card.types";
import CardTarotNpcFront from "./CardTarotNpcFront.vue";
import CardTarotMonsterFront from "./CardTarotMonsterFront.vue";
import CardTarotItemFront from "./CardTarotItemFront.vue";
import CardTarotSpellFront from "./CardTarotSpellFront.vue";

defineProps<{ subject: CardSubject }>();
</script>
