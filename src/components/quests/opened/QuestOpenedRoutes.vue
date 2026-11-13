<template>
  <section v-if="choices.length" class="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Where Advance can go">
    <h3 class="text-heading-sm font-bold text-foreground">Where Advance can go</h3>
    <ul class="flex flex-col gap-1.5">
      <li v-for="choice in choices" :key="choice.edge_id">
        <AppButton
          variant="subtle"
          size="sm"
          block
          class="min-h-11 justify-start gap-2 text-left"
          :disabled="isClosed(choice)"
          @click="emit('choose', choice.edge_id)"
        >
          <span class="min-w-0 flex-1 truncate">{{ choice.beat_title }}</span>
          <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ choice.route_kind === "parallel" ? "alongside" : "choice" }}</span>
          <span v-if="isClosed(choice)" class="shrink-0 text-caption text-destructive">{{ closedReason(choice) }}</span>
        </AppButton>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { QuestRuntimeChoice } from "@/types/quest.types";
import AppButton from "@/components/common/controls/AppButton.vue";

/** Every route out of the beat the party stands at, with its kind and gate. */
defineProps<{ choices: QuestRuntimeChoice[] }>();
const emit = defineEmits<{ choose: [edgeId: string] }>();

function isClosed(choice: QuestRuntimeChoice): boolean {
  return !!choice.gate && !choice.gate.is_open;
}
function closedReason(choice: QuestRuntimeChoice): string {
  const unmet = choice.gate?.conditions.find((condition) => !condition.met);
  return unmet ? `needs ${unmet.objective}` : "closed";
}
</script>
