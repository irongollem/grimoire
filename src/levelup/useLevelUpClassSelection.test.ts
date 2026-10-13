import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { CharacterClass } from "@/types/multiclass.types";
import type { PartyMember } from "@/types/party.types";

const classRows = ref<CharacterClass[] | undefined>([]);
const systemClasses = ref<unknown[] | undefined>([]);
const customClasses = ref<unknown[] | undefined>([]);
const subclasses = ref<unknown[] | undefined>([]);

vi.mock("@/composables/party/useCharacterClasses", () => ({
  useCharacterClasses: () => ({ data: classRows }),
  useMulticlassPrereqs: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/rules/useCustomClasses", () => ({
  useCampaignSystemClasses: () => ({ data: ref([]), all: systemClasses }),
  useCampaignCustomClasses: () => ({ data: ref([]), all: customClasses }),
}));
vi.mock("@/composables/rules/useCustomSubclasses", () => ({
  useCampaignCustomSubclasses: () => ({ data: ref([]), all: subclasses }),
}));
vi.mock("@/composables/rules/useOptionalRules", () => ({
  useOptionalRules: () => ({ data: ref(undefined) }),
  isRuleEffectivelyEnabled: () => false,
}));

import { useLevelUpClassSelection } from "./useLevelUpClassSelection";

const fighterDef = { id: "def-fighter", class_name: "Fighter", subclass_level: 3, caster_type: "none", spell_slots: null };
const held = { id: "sub-held", subclass_name: "Held", spellcasting: null, class_name: "Fighter" };
const knight = { id: "sub-ek", subclass_name: "Eldritch Knight", spellcasting: null, class_name: "Fighter" };

function row(levels: number, subclassId: string | null): CharacterClass {
  return {
    id: "row-1", party_member_id: "m1", class_name: "Fighter", class_definition_id: "def-fighter",
    class_definition_kind: "system", subclass_name: subclassId ? "Held" : null, subclass_definition_id: subclassId,
    subclass_variant: null, levels, is_primary: true, hit_dice_used: 0, sort_order: 0, created_at: "", updated_at: "",
  };
}

function setup(levels: number, heldId: string | null) {
  classRows.value = [row(levels, heldId)];
  systemClasses.value = [fighterDef];
  customClasses.value = [];
  subclasses.value = [held, knight];
  const scope = effectScope();
  const selection = scope.run(() => useLevelUpClassSelection(() => ({ id: "m1", level: levels }) as PartyMember))!;
  return { selection, stop: () => scope.stop() };
}

describe("useLevelUpClassSelection customSubclass", () => {
  it("is the held subclass when this level asks for no subclass, whatever was picked before", async () => {
    const { selection, stop } = setup(5, "sub-held"); // level 6: no choice due
    await nextTick();
    expect(selection.needsSubclassChoice.value).toBe(false);
    selection.subclassDefinitionId.value = "sub-ek";
    selection.subclassInput.value = "Eldritch Knight";
    expect(selection.customSubclass.value?.id).toBe("sub-held");
    stop();
  });

  it("is the pick only once a name and its definition are both set, at the level that asks", async () => {
    const { selection, stop } = setup(2, null); // level 3: the choice is due
    await nextTick();
    expect(selection.needsSubclassChoice.value).toBe(true);
    selection.subclassDefinitionId.value = "sub-ek";
    expect(selection.customSubclass.value).toBeNull(); // no name: the payload sends nothing
    selection.subclassInput.value = "  ";
    expect(selection.customSubclass.value).toBeNull();
    selection.subclassInput.value = "Eldritch Knight";
    expect(selection.customSubclass.value?.id).toBe("sub-ek");
    stop();
  });
});

describe("useLevelUpClassSelection castingInputsLoaded", () => {
  it("waits for the class rows, both class lists and the subclasses", async () => {
    const { selection, stop } = setup(2, null);
    expect(selection.castingInputsLoaded.value).toBe(true);
    subclasses.value = undefined;
    expect(selection.castingInputsLoaded.value).toBe(false);
    subclasses.value = [];
    systemClasses.value = undefined;
    expect(selection.castingInputsLoaded.value).toBe(false);
    stop();
  });
});
