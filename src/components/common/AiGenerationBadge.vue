<template>
  <TransitionGroup name="slide-up" tag="div" class="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
    <div
      v-for="entry in activePills"
      :key="entry.label"
      class="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg border border-border bg-card text-body max-w-sm w-max"
    >
      <!-- Generating -->
      <template v-if="entry.isGenerating.value">
        <IconGenerate class="h-4 w-4 text-primary animate-pulse shrink-0" />
        <span class="text-foreground italic truncate max-w-50">{{ currentLoadingQuote }}</span>
        <button
          class="text-muted-foreground hover:text-foreground transition-colors shrink-0 underline underline-offset-2 text-xs font-cinzel tracking-wide"
          @click="entry.openPanel()"
        >
          Watch
        </button>
      </template>

      <!-- Completed -->
      <template v-else-if="entry.completedEntityId.value">
        <IconCheckCircle class="h-4 w-4 text-emerald-500 shrink-0" />
        <span class="text-foreground italic">{{ entry.label }} ready!</span>
        <button
          class="text-primary hover:opacity-80 transition-opacity shrink-0 underline underline-offset-2 text-xs font-cinzel tracking-wide"
          @click="viewEntity(entry)"
        >
          View
        </button>
        <button
          class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Dismiss"
          @click="entry.clearCompleted()"
        >
          <IconClose class="h-3.5 w-3.5" />
        </button>
      </template>

      <!-- Error -->
      <template v-else-if="entry.error.value">
        <IconAlertCircle class="h-4 w-4 text-destructive shrink-0" />
        <span class="text-destructive italic truncate max-w-45">{{ entry.label }} generation failed</span>
        <button
          class="text-muted-foreground hover:text-foreground transition-colors shrink-0 underline underline-offset-2 text-xs font-cinzel tracking-wide"
          @click="entry.openPanel()"
        >
          Reopen
        </button>
        <button
          class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Dismiss"
          @click="entry.clearError()"
        >
          <IconClose class="h-3.5 w-3.5" />
        </button>
      </template>
    </div>
  </TransitionGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { IconAlertCircle, IconCheckCircle, IconClose, IconGenerate } from '@/lib/icons';
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { getAiGeneratorRegistry } from "@/ai/aiGeneratorRegistry";

const router = useRouter();
const registry = getAiGeneratorRegistry();

// Show a pill for completed or errored generators (in-progress is shown in the sidebar spinner)
const activePills = computed(() =>
  registry.filter(
    (entry) => !!entry.completedEntityId.value || !!entry.error.value,
  ),
);

function viewEntity(entry: (typeof registry)[number]) {
  const id = entry.completedEntityId.value;
  entry.clearCompleted();
  if (id) router.push(entry.entityRoute(id));
}
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
