<template>
  <!--
    Renders nothing once every starter scene is on the board. A permanent "add
    the starter scenes" affordance that does nothing is worse than no affordance.
  -->
  <div
    v-if="hasMissingScenes || justAdded"
    class="rounded-lg border border-gold-500/30 bg-card/50 p-4 space-y-3"
  >
    <div class="space-y-1">
      <h3 class="font-cinzel text-body text-gold-300">{{ heading }}</h3>
      <p class="text-caption text-muted-foreground">
        Ready-made scenes built from our own Creative Commons library — free on every tier, and they
        don't count against your sound or playlist limits.
      </p>
    </div>

    <!-- Only what's missing is listed, so the offer matches the button. -->
    <ul v-if="!compact" class="grid gap-1.5 sm:grid-cols-2">
      <li
        v-for="scene in missingScenes"
        :key="scene.slug"
        class="rounded-md border border-border bg-background/40 px-2.5 py-2"
      >
        <p class="font-cinzel text-xs text-foreground">{{ scene.name }}</p>
        <p class="text-caption-sm text-muted-foreground">{{ scene.description }}</p>
      </li>
    </ul>
    <p v-else class="text-caption text-muted-foreground/80">
      {{ missingScenes.map((s) => s.name).join(" · ") }}
    </p>

    <p v-if="!compact" class="text-caption text-muted-foreground/70">
      Each one is tagged with its theme, so encounters and locations can drive them straight away.
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="px-3 py-1.5 rounded-md border bg-gold-500/15 border-gold-500/40 text-gold-300 hover:bg-gold-500/25 font-cinzel text-xs tracking-wide transition-colors disabled:opacity-50"
        :disabled="!canAdd"
        @click="add"
      >
        {{ buttonLabel }}
      </button>
      <p v-if="justAdded" class="text-caption text-emerald-300">
        Added {{ addedCount }} {{ addedCount === 1 ? "scene" : "scenes" }}.
      </p>
      <p v-else-if="errorMessage" class="text-caption text-destructive">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useStarterScenes } from "@/composables/soundboard/useStarterScenes";
import { STARTER_SCENES } from "@/data/starterScenes";

const STARTER_SCENE_TOTAL = STARTER_SCENES.length;

/**
 * `compact` drops the per-scene grid and the explanatory line, for surfaces
 * where this sits alongside existing content rather than filling an empty page.
 * One component with a prop, not a second copy that drifts.
 */
const { compact = false } = defineProps<{ compact?: boolean }>();

const { addScenes, isAdding, addedCount, errorMessage, canAdd, missingScenes, hasMissingScenes } =
  useStarterScenes();

const justAdded = ref(false);

const heading = computed(() =>
  missingScenes.value.length === STARTER_SCENE_TOTAL
    ? "Start with a stocked board"
    : "Add the rest of the starter scenes",
);

const buttonLabel = computed(() => {
  if (isAdding.value) return "Adding…";
  const count = missingScenes.value.length;
  if (count === 0) return "All scenes added";
  return count === 1 ? "Add 1 scene" : `Add ${count} scenes`;
});

async function add(): Promise<void> {
  justAdded.value = false;
  try {
    await addScenes();
    justAdded.value = true;
  } catch {
    // `errorMessage` already carries what went wrong and is rendered above;
    // rethrowing here would only produce an unhandled rejection.
  }
}
</script>
