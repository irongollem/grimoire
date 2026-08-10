<template>
  <EntityLightbox :open="true" max-width="2xl" @close="emit('close')">
    <header>
      <p class="text-label font-bold uppercase tracking-wider text-primary">Run notes & consequences</p>
      <h2 class="font-cinzel text-lg font-bold text-foreground">{{ beat.title }}</h2>
      <p class="text-caption text-muted-foreground">Changes autosave to this beat without leaving the session flow.</p>
    </header>
    <QuestBeatFields :beat="beat" @saved="emit('saved', $event)" />
    <footer class="flex justify-end">
      <AppButton label="Back to beat" variant="primary" @click="emit('close')" />
    </footer>
  </EntityLightbox>
</template>

<script setup lang="ts">
import type { QuestBeat } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import QuestBeatFields from "./QuestBeatFields.vue";

defineProps<{ beat: QuestBeat }>();
const emit = defineEmits<{ close: []; saved: [beat: QuestBeat] }>();
</script>
