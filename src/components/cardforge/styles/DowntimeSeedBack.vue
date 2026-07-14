<template>
  <LootBack :tarot="tarot" :back-id="store.downtimeDeckBackId" />
</template>

<script setup lang="ts">
/**
 * The shared back of an Interlude *outcome* card.
 *
 * This is the whole point of an outcome card: it is drawn from a **face-down
 * stack**, so its back must be identical for every card in the deck. An earlier
 * version rendered the seed's own vignette here — which put the secret on the
 * side you stare at while the card is face-down, leaving the deck transparent
 * and impossible to shuffle. Every scrap of per-seed information now lives on
 * the front; this side says nothing at all.
 *
 * It reuses the loot deck's back registry and artwork rather than growing a
 * parallel one (a deck back is a deck back), and it is style-agnostic — one
 * component serves both Inked and Modern, because a face-down card has no style.
 *
 * The dispatchers pass `:data` to every card component, so this accepts and
 * ignores it: the back must not depend on the seed, by design.
 */
import LootBack from "./loot/LootBack.vue";
import { useCardForgeStore } from "@/stores/cardForge";
import type { DowntimeSeed } from "@/types/downtime.types";

defineProps<{ data?: DowntimeSeed; tarot?: boolean }>();

const store = useCardForgeStore();
</script>
