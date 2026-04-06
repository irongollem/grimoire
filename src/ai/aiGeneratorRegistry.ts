/**
 * Registry of all AI generator panels.
 *
 * Each generator calls `registerAiGenerator()` at module level.
 * `AiGenerationBadge.vue` reads `aiGeneratorRegistry` to discover every active
 * generator without needing to be updated when new generators are added.
 */

import { computed } from "vue";
import type { AiGenerationState } from "./aiGenerationState";

export interface AiGeneratorRegistration extends AiGenerationState {
  /** Short human-readable label shown in the badge — e.g. "NPC", "Monster", "Item" */
  label: string;
  /** Builds the route to navigate to the completed entity — e.g. `/npcs/${id}` */
  entityRoute: (id: string) => string;
  /** Opens the generator's sidebar panel */
  openPanel: () => void;
}

const _registry: AiGeneratorRegistration[] = [];

/**
 * Register an AI generator so the `AiGenerationBadge` can track it.
 * Call this at module level in each `useXxxGeneration.ts`.
 */
export function registerAiGenerator(entry: AiGeneratorRegistration): void {
  _registry.push(entry);
}

/**
 * Read-only access to all registered generators.
 * The array itself is not reactive — the state refs *within* each entry are.
 */
export function getAiGeneratorRegistry(): readonly AiGeneratorRegistration[] {
  return _registry;
}

/**
 * True while any registered AI generator is generating.
 * Use this to disable generate buttons across all panels while one is active,
 * preventing concurrent generations.
 */
export const isAnyAiGenerating = computed(() =>
  _registry.some((entry) => entry.isGenerating.value),
);
