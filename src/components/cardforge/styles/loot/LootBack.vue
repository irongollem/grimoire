<template>
  <div class="loot-back" :class="{ tarot }">
    <img v-if="src" :src="src" alt="" class="loot-back-img" />
    <div v-else class="loot-back-placeholder">DECK BACK</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useCardForgeStore } from "@/stores/cardForge";
import { deckBackById } from "./deckBacks";

const { tarot = false } = defineProps<{ tarot?: boolean }>();

const store = useCardForgeStore();

const src = computed(() => {
  const back = deckBackById(store.lootDeckBackId);
  if (!back) return null;
  return back.urls[store.cardSize];
});
</script>

<style scoped>
.loot-back {
  position: relative;
  width: 200px;
  height: 280px;
  border-radius: 10px;
  overflow: hidden;
  background: #0c0a08;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.loot-back.tarot {
  width: 222px;
  height: 381px;
}
.loot-back-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.loot-back-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: "Cinzel", serif;
  font-size: 8px;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.25);
}
</style>
