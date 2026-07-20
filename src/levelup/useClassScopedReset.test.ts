import { describe, it, expect } from "vitest";
import { effectScope, ref, computed, nextTick } from "vue";
import { useClassScopedReset } from "./useClassScopedReset";

function setup(initialIdentity: string) {
  const identity = ref(initialIdentity);
  const subclassDefinitionId = ref("sub-def-1");
  const subclassInput = ref("Beast Master");
  const selectedSpellIds = ref(new Set(["srd_hunters_mark"]));
  const selectedCantripIds = ref(new Set(["srd_light"]));
  const stepValues = ref<Record<string, string>>({ favored_enemy: "Orcs" });
  const stepMultiValues = ref<Record<string, string[]>>({ expertise: ["Stealth", "Perception"] });

  const scope = effectScope();
  scope.run(() => {
    useClassScopedReset(computed(() => identity.value), {
      subclassDefinitionId,
      subclassInput,
      selectedSpellIds,
      selectedCantripIds,
      stepValues,
      stepMultiValues,
    });
  });

  return {
    identity, subclassDefinitionId, subclassInput,
    selectedSpellIds, selectedCantripIds, stepValues, stepMultiValues,
    stop: () => scope.stop(),
  };
}

describe("useClassScopedReset", () => {
  it("clears the stale subclass pin and picks when the chosen class changes", async () => {
    // Regression: switching from class A (subclass already picked) to class B
    // must not leave A's subclassDefinitionId paired with B's subclass name —
    // the server's class-name-mismatch trigger (migration 20260720000030)
    // rejects that combination outright.
    const state = setup("existing:class-a");
    state.identity.value = "existing:class-b";
    await nextTick();

    expect(state.subclassDefinitionId.value).toBe("");
    expect(state.subclassInput.value).toBe("");
    expect(state.selectedSpellIds.value.size).toBe(0);
    expect(state.selectedCantripIds.value.size).toBe(0);
    expect(state.stepValues.value).toEqual({});
    expect(state.stepMultiValues.value).toEqual({});
    state.stop();
  });

  it("clears state when switching from an existing class to a newly-added one", async () => {
    const state = setup("existing:class-a");
    state.identity.value = "new:system:wizard-def";
    await nextTick();

    expect(state.subclassDefinitionId.value).toBe("");
    expect(state.selectedSpellIds.value.size).toBe(0);
    state.stop();
  });

  it("leaves selections untouched while the identity is unchanged", async () => {
    const state = setup("existing:class-a");
    await nextTick();

    expect(state.subclassDefinitionId.value).toBe("sub-def-1");
    expect(state.subclassInput.value).toBe("Beast Master");
    expect(state.selectedSpellIds.value.has("srd_hunters_mark")).toBe(true);
    expect(state.stepValues.value).toEqual({ favored_enemy: "Orcs" });
    state.stop();
  });
});
