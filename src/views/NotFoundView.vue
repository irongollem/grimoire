<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-background px-4 text-center">
    <p class="font-cinzel text-8xl font-black text-gold-700 mb-4">404</p>
    <h1 class="font-cinzel text-2xl font-bold text-foreground mb-2">
      Lost in the Dungeon
    </h1>
    <p class="font-fell text-muted-foreground italic mb-8 max-w-sm">
      This page has been swallowed by the Underdark. Even the most seasoned adventurers occasionally take a wrong turn.
    </p>
    <RouterLink
      to="/dashboard"
      class="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
    >
      <Home class="h-4 w-4" />
      Return to Camp
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { Home } from 'lucide-vue-next'
</script>
