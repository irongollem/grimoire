<template>
  <HearthQuietNote v-if="appUi.dmPreviewMode" title="Session notes">
    Session notes are private to the player.
  </HearthQuietNote>
  <HearthSection v-else title="Session notes">
    <HearthQuickNotePad :started-at="startedAt" />
  </HearthSection>
</template>

<script setup lang="ts">
import HearthQuickNotePad from "./HearthQuickNotePad.vue";
import HearthQuietNote from "./HearthQuietNote.vue";
import HearthSection from "./HearthSection.vue";
import { useAppUiStore } from "@/stores/ui/app";

/**
 * A jotting pad for this sitting, saving itself into the player's journal. In
 * DM preview nothing is mounted that reads or writes the journal: those rows
 * are the player's own, and a pad would create them under the DM's account.
 */
const { startedAt } = defineProps<{ startedAt: string | null }>();
const appUi = useAppUiStore();
</script>
