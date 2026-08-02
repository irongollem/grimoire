/**
 * Registry of all AI generator panels.
 *
 * Each generator calls `registerAiGenerator()` at module level.
 * `AiGenerationBadge.vue` reads `aiGeneratorRegistry` to discover every active
 * generator without needing to be updated when new generators are added.
 */

import { computed, shallowReactive } from "vue";
import type { AiGenerationState } from "./aiGenerationState";

export interface AiGeneratorRegistration extends AiGenerationState {
  /** Short human-readable label shown in the badge — e.g. "NPC", "Monster", "Item" */
  label: string;
  /** Builds the route to navigate to the completed entity — e.g. `/npcs/${id}` */
  entityRoute: (id: string) => string;
  /** Opens the generator's sidebar panel */
  openPanel: () => void;
}

/**
 * Reactive in the array itself, not just in the entries — and it has to be.
 * The generator panels are async-loaded (see DefaultLayout.vue), so these
 * module-level `registerAiGenerator()` calls now run *after* AiGenerationBadge
 * has already rendered. A plain array left the badge's `computed` evaluating
 * against an empty registry, tracking zero reactive dependencies, and therefore
 * caching an empty result forever. `shallowReactive` makes the push itself a
 * tracked change; entries are not deep-proxied, so the `Ref`s inside each one
 * are still the raw refs their generator writes to.
 */
const _registry = shallowReactive<AiGeneratorRegistration[]>([]);

/**
 * Register an AI generator so the `AiGenerationBadge` can track it.
 * Call this at module level in each `useXxxGeneration.ts`.
 */
export function registerAiGenerator(entry: AiGeneratorRegistration): void {
  _registry.push(entry);
}

/**
 * Read-only access to all registered generators. Safe to call once and keep —
 * the returned array is reactive, so a consumer that captures it before the
 * async generator chunk has loaded still sees the entries appear.
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
