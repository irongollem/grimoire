import { describe, it, expect } from "vitest";
import { effectScope, ref, computed, nextTick } from "vue";
import { useClassScopedReset } from "./useClassScopedReset";

function setup(initialIdentity: string) {
  const identity = ref(initialIdentity);
  const subclassDefinitionId = ref("sub-def-1");
  const subclassInput = ref("Beast Master");
  const subclassVariant = ref("Forest");
  const selectedSpellIds = ref(new Set(["srd_hunters_mark"]));
  const selectedCantripIds = ref(new Set(["srd_light"]));
  const choiceValues = ref<Record<string, unknown>>({ "feat-1:favored_enemy": { picks: ["Orcs"] } });
  const swapPicks = ref<Record<string, string>>({ favored_enemy: "favored-foe" });

  const scope = effectScope();
  scope.run(() => {
    useClassScopedReset(computed(() => identity.value), {
      subclassDefinitionId,
      subclassInput,
      subclassVariant,
      selectedSpellIds,
      selectedCantripIds,
      choiceValues,
      swapPicks,
    });
  });

  return {
    identity, subclassDefinitionId, subclassInput, subclassVariant,
    selectedSpellIds, selectedCantripIds, choiceValues, swapPicks,
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
    expect(state.subclassVariant.value).toBe("");
    expect(state.selectedSpellIds.value.size).toBe(0);
    expect(state.selectedCantripIds.value.size).toBe(0);
    expect(state.choiceValues.value).toEqual({});
    expect(state.swapPicks.value).toEqual({});
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
    expect(state.choiceValues.value).toEqual({ "feat-1:favored_enemy": { picks: ["Orcs"] } });
    state.stop();
  });
});
