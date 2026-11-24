import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import AiGenerationBadge from "./AiGenerationBadge.vue";
import { registerAiGenerator } from "@/ai/aiGeneratorRegistry";
import { useAskUiStore } from "@/stores/ui/ask";

describe("AiGenerationBadge", () => {
  // Bug caught: Reopen on a failed generation did nothing, leaving the DM nowhere to go.
  it("Reopen on a failed generation opens the Familiar", async () => {
    setActivePinia(createPinia());
    registerAiGenerator({
      label: "Badge test",
      entityRoute: (id: string) => `/x/${id}`,
      isGenerating: ref(false),
      error: ref("boom"),
      completedEntityId: ref(null),
      concept: ref(""),
      clearCompleted: () => {},
      clearError: () => {},
    } as unknown as Parameters<typeof registerAiGenerator>[0]);
    const w = mount(AiGenerationBadge, {
      global: { mocks: { $router: {} }, stubs: { TransitionGroup: false } },
    });
    const ask = useAskUiStore();
    expect(ask.open).toBe(false);
    const reopen = w.findAll("button").find((b) => b.text() === "Reopen");
    expect(reopen).toBeDefined();
    await reopen!.trigger("click");
    expect(ask.open).toBe(true);
  });
});
