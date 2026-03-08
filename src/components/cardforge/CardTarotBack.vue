<template>
  <CardTarotNpcBack v-if="subject.kind === 'npc'" :data="subject.data" />
  <CardTarotMonsterBack v-else-if="subject.kind === 'monster'" :data="subject.data" />
  <CardTarotItemBack v-else-if="subject.kind === 'item'" :data="subject.data" />
  <CardTarotSpellBack v-else-if="subject.kind === 'spell'" :data="subject.data" />
</template>

<script setup lang="ts">
import type { CardSubject } from "@/types/card.types";
import CardTarotNpcBack from "./CardTarotNpcBack.vue";
import CardTarotMonsterBack from "./CardTarotMonsterBack.vue";
import CardTarotItemBack from "./CardTarotItemBack.vue";
import CardTarotSpellBack from "./CardTarotSpellBack.vue";

defineProps<{ subject: CardSubject }>();
</script>
