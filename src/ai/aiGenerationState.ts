/**
 * Shared factory and utilities for AI generation features.
 *
 * ## Adding a new AI generator
 *
 * 1. Create `useXxxGeneration.ts` that calls `createAiGenerationState()` at module level.
 * 2. In the same file, call `registerAiGenerator(...)` at module level to register it with
 *    the badge system.
 * 3. Call `startAiQuotes()` when generation begins and `stopAiQuotes()` when it ends.
 * 4. Mount the generator's panel component in `DefaultLayout.vue` (always-mounted so
 *    generation survives navigation).
 * 5. Add the panel's open flag to `useUiStore` and pass `openPanel` to the registration.
 *
 * That's all — the `AiGenerationBadge` will discover it automatically via the registry.
 */

import { ref, computed } from "vue";
import type { Ref } from "vue";

// ── Rotating quotes ─────────────────────────────────────────────────────────

const TEXT_QUOTES = [
  "Conjuring character details…",
  "Forging a questionable backstory…",
  "Consulting the tavern gossip…",
  "Rolling for personality…",
  "Inventing a mysterious scar…",
  "Browsing the rogues' gallery…",
  "Rehearsing the villain monologue…",
  "Picking a suspiciously convenient name…",
  "Bribing the local scribe…",
  "Negotiating with the character's conscience…",
  "Sharpening the plot hooks…",
  "Consulting the oracle (on a budget)…",
  "Thumbing through the monster manual…",
  "Cross-referencing the arcane registry…",
  "Querying the Hall of Records…",
  "Dusting off the lore tomes…",
];

const IMAGE_QUOTES = [
  "Mixing magical pigments…",
  "Posing the subject under a dramatic torch…",
  "Adding a suspicious moustache…",
  "Visiting the character barber…",
  "Draping a mysteriously ominous cloak…",
  "Arguing about lighting with the court painter…",
  "Touching up the glowing runes…",
  "Adjusting the focal point of the enchanted canvas…",
  "Picking the right shade of menacing shadow…",
  "Convincing the subject to hold still…",
  "Sourcing the correct shade of villainous purple…",
  "Framing the ideal heroic silhouette…",
];

const _quotePool = ref<string[]>(TEXT_QUOTES);
const _quoteIndex = ref(0);
let _quoteInterval: ReturnType<typeof setInterval> | null = null;

/** Start cycling the loading quotes. Call when generation begins. */
export function startAiQuotes(phase: "text" | "image" = "text") {
  const pool = phase === "image" ? IMAGE_QUOTES : TEXT_QUOTES;
  _quotePool.value = pool;
  _quoteIndex.value = Math.floor(Math.random() * pool.length);
  _quoteInterval = setInterval(() => {
    _quoteIndex.value = (_quoteIndex.value + 1) % _quotePool.value.length;
  }, 3000);
}

/** Stop cycling the loading quotes. Call when generation ends (success or error). */
export function stopAiQuotes() {
  if (_quoteInterval) {
    clearInterval(_quoteInterval);
    _quoteInterval = null;
  }
}

/** Current rotating flavor quote — import this wherever a loading state is displayed. */
export const currentLoadingQuote = computed(
  () => _quotePool.value[_quoteIndex.value],
);

// ── Per-generator state factory ─────────────────────────────────────────────

export interface AiGenerationState {
  isGenerating: Ref<boolean>;
  error: Ref<string | null>;
  /** ID of the entity created while the panel was dismissed — shown in badge. */
  completedEntityId: Ref<string | null>;
  /** Concept text stored for display in the background badge. */
  concept: Ref<string>;
  clearCompleted: () => void;
  clearError: () => void;
}

/**
 * Create a module-level singleton state object for one AI generator.
 * Call this at the top of each `useXxxGeneration.ts` file (outside the composable
 * function) so that the state persists across navigation / component unmounts.
 */
export function createAiGenerationState(): AiGenerationState {
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const completedEntityId = ref<string | null>(null);
  const concept = ref("");

  return {
    isGenerating,
    error,
    completedEntityId,
    concept,
    clearCompleted: () => {
      completedEntityId.value = null;
    },
    clearError: () => {
      error.value = null;
    },
  };
}
