<template>
  <li class="flex flex-col gap-1 py-2" :data-closed="closed ? 'true' : undefined" data-testid="record-fact">
    <p class="text-body" :class="closed ? 'text-muted-foreground line-through decoration-1' : 'text-foreground'">{{ fact.body }}</p>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
      <span v-if="closed">Overtaken by what follows</span>
      <span v-if="origin">{{ origin }}</span>
      <span v-if="!fact.known_to_player" class="font-semibold text-foreground">The party does not know this yet</span>
      <AppButton v-for="item in about" :key="`${item.kind}:${item.id}`" :to="item.to" variant="link" size="inline" :label="item.label" />
      <!-- Apart from the names: those lead away to a person or a place, these change the record. -->
      <span v-if="canWrite" class="ml-auto flex items-center gap-x-3">
        <AppButton v-if="!fact.known_to_player" variant="link" size="inline" label="Reveal" @click="emit('reveal', fact)" />
        <AppButton v-if="!closed" variant="link" size="inline" label="Correct this" @click="emit('correct', fact)" />
      </span>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { factOrigin, type StoryFact } from "@/lib/table/storyRecord";

const { fact, closed, about = [], canWrite = false } = defineProps<{
  fact: StoryFact;
  /** A later fact has overtaken this one. */
  closed: boolean;
  /** What the fact is about, already named and routed. */
  about?: readonly { kind: string; id: string; label: string; to: string }[];
  /** Whoever may write the record (a DM today) is offered Correct and Reveal. */
  canWrite?: boolean;
}>();
const emit = defineEmits<{ correct: [fact: StoryFact]; reveal: [fact: StoryFact] }>();

const origin = computed(() => factOrigin(fact.source));
</script>
