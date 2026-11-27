<template>
  <!-- The Familiar asking how, drawn as it draws a reply, with the walk's own outline chips under it. -->
  <div class="flex flex-col gap-1.5" data-testid="walk-choose">
    <p class="text-body text-foreground">{{ item.text }}</p>
    <div v-if="!item.answered" class="flex flex-wrap gap-1.5" role="group" aria-label="Ways to begin">
      <AppButton variant="outline" size="sm" label="Section by section" data-testid="walk-way-sections" @click="emit('choose', 'sections')" />
      <AppButton variant="outline" size="sm" label="Just tell you" data-testid="walk-way-story" @click="emit('choose', 'story')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/** How "Design it with me" begins (#1282): the two ways, as chips that go quiet once one is pressed. */
import AppButton from "@/components/common/controls/AppButton.vue";
import type { AskItem } from "@/composables/ask/askItems";

const { item } = defineProps<{ item: Extract<AskItem, { kind: "walk-choose" }> }>();
const emit = defineEmits<{ choose: [way: "sections" | "story"] }>();
</script>
