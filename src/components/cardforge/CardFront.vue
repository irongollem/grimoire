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
import InkedDowntimeFront from "./styles/inked/InkedDowntimeFront.vue";
import ModernNpcFront from "./styles/modern/ModernNpcFront.vue";
import ModernMonsterFront from "./styles/modern/ModernMonsterFront.vue";
import ModernItemFront from "./styles/modern/ModernItemFront.vue";
import ModernSpellFront from "./styles/modern/ModernSpellFront.vue";
import ModernDowntimeFront from "./styles/modern/ModernDowntimeFront.vue";
import InkedDowntimeSeedFront from "./styles/inked/InkedDowntimeSeedFront.vue";
import ModernDowntimeSeedFront from "./styles/modern/ModernDowntimeSeedFront.vue";
const props = defineProps<{ subject: CardSubject; cardStyle?: "inked" | "modern" }>();
const map = {
  inked: { npc: InkedNpcFront, monster: InkedMonsterFront, item: InkedItemFront, spell: InkedSpellFront, downtime: InkedDowntimeFront, "downtime-seed": InkedDowntimeSeedFront },
  modern: { npc: ModernNpcFront, monster: ModernMonsterFront, item: ModernItemFront, spell: ModernSpellFront, downtime: ModernDowntimeFront, "downtime-seed": ModernDowntimeSeedFront },
} as const;
const component = computed<Component>(() => map[props.cardStyle ?? "inked"][props.subject.kind]);
</script>
