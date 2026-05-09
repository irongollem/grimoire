<template>
  <component :is="component" :data="subject.data" tarot />
</template>
<script setup lang="ts">
import { computed, type Component } from "vue";
import type { CardSubject } from "@/types/card.types";
import InkedNpcBack from "./styles/inked/InkedNpcBack.vue";
import InkedMonsterBack from "./styles/inked/InkedMonsterBack.vue";
import InkedItemBack from "./styles/inked/InkedItemBack.vue";
import InkedSpellBack from "./styles/inked/InkedSpellBack.vue";
import ModernNpcBack from "./styles/modern/ModernNpcBack.vue";
import ModernMonsterBack from "./styles/modern/ModernMonsterBack.vue";
import ModernItemBack from "./styles/modern/ModernItemBack.vue";
import ModernSpellBack from "./styles/modern/ModernSpellBack.vue";
const props = defineProps<{ subject: CardSubject; cardStyle?: "inked" | "modern" }>();
const map = {
  inked: { npc: InkedNpcBack, monster: InkedMonsterBack, item: InkedItemBack, spell: InkedSpellBack },
  modern: { npc: ModernNpcBack, monster: ModernMonsterBack, item: ModernItemBack, spell: ModernSpellBack },
} as const;
const component = computed<Component>(() => map[props.cardStyle ?? "inked"][props.subject.kind]);
</script>
