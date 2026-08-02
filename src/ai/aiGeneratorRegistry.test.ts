import { describe, it, expect } from "vitest";
import { computed, ref } from "vue";
import {
  registerAiGenerator,
  getAiGeneratorRegistry,
  isAnyAiGenerating,
  type AiGeneratorRegistration,
} from "./aiGeneratorRegistry";

function makeEntry(label: string): AiGeneratorRegistration {
  return {
    label,
    entityRoute: (id: string) => `/${label}/${id}`,
    openPanel: () => {},
    isGenerating: ref(false),
    error: ref(null),
    completedEntityId: ref(null),
    concept: ref(""),
    clearCompleted: () => {},
    clearError: () => {},
  };
}

/**
 * The generator panels are async-loaded, so every `registerAiGenerator()` call
 * happens *after* AiGenerationBadge has rendered and read the registry. These
 * tests pin the consequence: a consumer that evaluates against an empty
 * registry must still see generators that register later. With a plain
 * (non-reactive) array the computed below tracks nothing on its first run and
 * stays empty forever — which silently breaks the badge.
 */
describe("aiGeneratorRegistry", () => {
  it("invalidates a computed that was first evaluated while empty", () => {
    const registry = getAiGeneratorRegistry();
    const labels = computed(() => registry.map((e) => e.label));

    // Read once up front, exactly as the badge does on first render.
    const before = [...labels.value];

    registerAiGenerator(makeEntry("late-arrival"));

    expect(labels.value).toContain("late-arrival");
    expect(labels.value.length).toBe(before.length + 1);
  });

  it("tracks the isGenerating ref of a generator registered after first read", () => {
    // Evaluate before registering so the computed caches with the entry absent.
    expect(isAnyAiGenerating.value).toBe(false);

    const entry = makeEntry("deferred");
    registerAiGenerator(entry);
    expect(isAnyAiGenerating.value).toBe(false);

    entry.isGenerating.value = true;
    expect(isAnyAiGenerating.value).toBe(true);

    entry.isGenerating.value = false;
    expect(isAnyAiGenerating.value).toBe(false);
  });
});
