<template>
  <div v-if="!audienceId" class="rounded-lg border border-dashed border-border p-6 text-center text-body text-muted-foreground">Choose an audience to load the player-safe quest.</div>
  <LoadingSpinner v-else-if="loading" class="mx-auto my-12" />
  <div v-else-if="error" role="alert" class="rounded-lg border border-destructive/40 p-3 text-body text-destructive">The safe player projection could not be loaded.</div>
  <div v-else-if="!beats.length" class="rounded-lg border border-dashed border-border p-6 text-center text-body text-muted-foreground">No rumored or revealed story moments are currently visible to this audience.</div>
  <PlayerQuestStoryThread v-else :beats="beats" />
</template>

<script setup lang="ts">
import type { PlayerQuestBeat } from "@/types/quest.types";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import PlayerQuestStoryThread from "@/components/player/PlayerQuestStoryThread.vue";

defineProps<{ audienceId: string; loading: boolean; error: boolean; beats: PlayerQuestBeat[] }>();
</script>
