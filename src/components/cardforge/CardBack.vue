<template>
  <CardNpcBack v-if="subject.kind === 'npc'" :data="subject.data" />
  <CardMonsterBack v-else-if="subject.kind === 'monster'" :data="subject.data" />
  <CardItemBack v-else-if="subject.kind === 'item'" :data="subject.data" />
  <CardSpellBack v-else-if="subject.kind === 'spell'" :data="subject.data" />
</template>

<script setup lang="ts">
import type { CardSubject } from "@/types/card.types";
import CardNpcBack from "./CardNpcBack.vue";
import CardMonsterBack from "./CardMonsterBack.vue";
import CardItemBack from "./CardItemBack.vue";
import CardSpellBack from "./CardSpellBack.vue";

defineProps<{ subject: CardSubject }>();
</script>
