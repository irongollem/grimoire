<template>
  <template v-if="cardStyle === 'modern'">
    <ModernNpcBack     v-if="subject.kind === 'npc'"     :data="subject.data" />
    <ModernMonsterBack v-else-if="subject.kind === 'monster'" :data="subject.data" />
    <ModernItemBack    v-else-if="subject.kind === 'item'"    :data="subject.data" />
    <ModernSpellBack   v-else-if="subject.kind === 'spell'"   :data="subject.data" />
  </template>
  <template v-else>
    <InkedNpcBack     v-if="subject.kind === 'npc'"     :data="subject.data" />
    <InkedMonsterBack v-else-if="subject.kind === 'monster'" :data="subject.data" />
    <InkedItemBack    v-else-if="subject.kind === 'item'"    :data="subject.data" />
    <InkedSpellBack   v-else-if="subject.kind === 'spell'"   :data="subject.data" />
  </template>
</template>
<script setup lang="ts">
import type { CardSubject } from "@/types/card.types";
import InkedNpcBack from "./styles/inked/InkedNpcBack.vue";
import InkedMonsterBack from "./styles/inked/InkedMonsterBack.vue";
import InkedItemBack from "./styles/inked/InkedItemBack.vue";
import InkedSpellBack from "./styles/inked/InkedSpellBack.vue";
import ModernNpcBack from "./styles/modern/ModernNpcBack.vue";
import ModernMonsterBack from "./styles/modern/ModernMonsterBack.vue";
import ModernItemBack from "./styles/modern/ModernItemBack.vue";
import ModernSpellBack from "./styles/modern/ModernSpellBack.vue";
defineProps<{ subject: CardSubject; cardStyle?: "inked" | "modern" }>();
defineOptions({ inheritAttrs: false });
</script>