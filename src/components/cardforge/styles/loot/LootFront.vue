<template>
  <component :is="component" :data="data" :tarot="tarot" />
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import type { Item } from "@/types/item.types";
import { useCardForgeStore } from "@/stores/cardForge";
import InkedLootFront from "./InkedLootFront.vue";
import ModernLootFront from "./ModernLootFront.vue";

defineProps<{ data: Item; tarot?: boolean }>();

const store = useCardForgeStore();

const component = computed<Component>(() =>
  store.cardStyle === "modern" ? ModernLootFront : InkedLootFront,
);
</script>
