<template>
  <template v-if="cardStyle === 'modern'">
    <ModernNpcFront     v-if="subject.kind === 'npc'"     :data="subject.data" />
    <ModernMonsterFront v-else-if="subject.kind === 'monster'" :data="subject.data" />
    <ModernItemFront    v-else-if="subject.kind === 'item'"    :data="subject.data" />
    <ModernSpellFront   v-else-if="subject.kind === 'spell'"   :data="subject.data" />
  </template>
  <template v-else>
    <InkedNpcFront     v-if="subject.kind === 'npc'"     :data="subject.data" />
    <InkedMonsterFront v-else-if="subject.kind === 'monster'" :data="subject.data" />
    <InkedItemFront    v-else-if="subject.kind === 'item'"    :data="subject.data" />
    <InkedSpellFront   v-else-if="subject.kind === 'spell'"   :data="subject.data" />
  </template>
</template>
<script setup lang="ts">
import type { CardSubject } from "@/types/card.types";
import InkedNpcFront from "./styles/inked/InkedNpcFront.vue";
import InkedMonsterFront from "./styles/inked/InkedMonsterFront.vue";
import InkedItemFront from "./styles/inked/InkedItemFront.vue";
import InkedSpellFront from "./styles/inked/InkedSpellFront.vue";
import ModernNpcFront from "./styles/modern/ModernNpcFront.vue";
import ModernMonsterFront from "./styles/modern/ModernMonsterFront.vue";
import ModernItemFront from "./styles/modern/ModernItemFront.vue";
import ModernSpellFront from "./styles/modern/ModernSpellFront.vue";
defineProps<{ subject: CardSubject; cardStyle?: "inked" | "modern" }>();
defineOptions({ inheritAttrs: false });
</script>