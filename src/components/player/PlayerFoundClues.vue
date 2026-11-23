<template>
  <section v-if="rows.length > 0" aria-labelledby="world-found" data-testid="found-clues">
    <h2 id="world-found" class="text-label text-muted-foreground mb-2">What we have found</h2>
    <ul class="rounded-lg border border-border bg-card divide-y divide-border">
      <li v-for="row in rows" :key="row.clue.id" class="px-4 py-3">
        <p class="text-body text-foreground">{{ row.clue.title }}</p>
        <p v-if="row.where" class="text-caption text-muted-foreground/70 italic mt-0.5" data-testid="found-where">
          {{ row.where.kind === "place" ? "Found at" : "Found with" }} {{ row.where.name }}
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * "What we have found" on the player's World tab (#1258 item 23): the clues the party has found, newest first. A clue
 * says where it lay only as a place, person or item this player can see; otherwise it is just its title, and never
 * says which secret it points at.
 */
import type { FoundClueRow } from "@/composables/canon/usePlayerFoundClues";

defineProps<{ rows: readonly FoundClueRow[] }>();
</script>
