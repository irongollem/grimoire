<template>
  <nav class="map-nav" aria-label="Battle map" data-testid="map-nav">
    <span class="item is-here" aria-current="page">
      <IconMap class="h-5 w-5" />
      <span>Map</span>
    </span>
    <RouterLink to="/play/character/sheet" class="item" data-testid="map-nav-sheet">
      <IconScrollText class="h-5 w-5" />
      <span>My sheet</span>
    </RouterLink>
    <!-- The same roller the rest of the portal uses, so a roll still reaches chat and the sound. -->
    <div class="item" data-testid="map-nav-roll">
      <DiceRoller />
      <span>Roll</span>
    </div>
  </nav>
</template>

<script setup lang="ts">
import DiceRoller from "@/components/common/dice/DiceRoller.vue";
import { IconMap, IconScrollText } from "@/lib/icons";
</script>

<style scoped>
.map-nav {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: color-mix(in oklab, var(--card) 92%, transparent);
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
}
.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  min-height: 3.25rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
.is-here {
  color: var(--primary);
}
</style>
