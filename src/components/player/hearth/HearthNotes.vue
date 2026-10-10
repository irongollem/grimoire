<template>
  <HearthQuietNote v-if="appUi.dmPreviewMode" title="Your notes">
    A player's own notes are private to them.
  </HearthQuietNote>
  <HearthNotesList v-else />
</template>

<script setup lang="ts">
import HearthNotesList from "./HearthNotesList.vue";
import HearthQuietNote from "./HearthQuietNote.vue";
import { useAppUiStore } from "@/stores/ui/app";

/**
 * In DM preview the player's notes cannot be shown (they are private to the
 * player), and the list reads user-scoped queries that would answer as the DM,
 * so the list is not mounted at all.
 */
const appUi = useAppUiStore();
</script>
