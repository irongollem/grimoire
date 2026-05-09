<template>
  <component :is="component" :data="subject.data" />
</template>
<script setup lang="ts">
import { computed, type Component } from "vue";
import type { CardSubject } from "@/types/card.types";
import InkedNpcFront from "./styles/inked/InkedNpcFront.vue";
import InkedMonsterFront from "./styles/inked/InkedMonsterFront.vue";
import InkedItemFront from "./styles/inked/InkedItemFront.vue";
import InkedSpellFront from "./styles/inked/InkedSpellFront.vue";
import ModernNpcFront from "./styles/modern/ModernNpcFront.vue";
import ModernMonsterFront from "./styles/modern/ModernMonsterFront.vue";
import ModernItemFront from "./styles/modern/ModernItemFront.vue";
import ModernSpellFront from "./styles/modern/ModernSpellFront.vue";
const props = defineProps<{ subject: CardSubject; cardStyle?: "inked" | "modern" }>();
const map = {
  inked: { npc: InkedNpcFront, monster: InkedMonsterFront, item: InkedItemFront, spell: InkedSpellFront },
  modern: { npc: ModernNpcFront, monster: ModernMonsterFront, item: ModernItemFront, spell: ModernSpellFront },
} as const;
const component = computed<Component>(() => map[props.cardStyle ?? "inked"][props.subject.kind]);
</script>
