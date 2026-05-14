import { ref, computed, watch, type Ref } from "vue";
import { ARTIFICER_INFUSIONS, ARTIFICER_INFUSIONS_MAP } from "@/data/artificerInfusions";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useUpdatePartyMember } from "@/composables/useParty";
import type { PartyMember } from "@/types/party.types";
import type { ArtificerInfusion } from "@/data/artificerInfusions";

interface CharacterClass { class_name: string; levels: number }

export function useArtificerState(
  member: Ref<PartyMember>,
  characterClasses: Ref<CharacterClass[] | undefined>,
) {
  const { mutate: updateMember } = useUpdatePartyMember();
  const { data: partyInventory } = usePartyInventory();

  const isArtificer = computed(() =>
    member.value.class === "Artificer" ||
    (characterClasses.value ?? []).some(cc => cc.class_name === "Artificer"),
  );

  const artificerLevel = computed(() =>
    (characterClasses.value ?? []).find(cc => cc.class_name === "Artificer")?.levels ??
    (member.value.class === "Artificer" ? member.value.level : 0),
  );

  const memberInventoryItems = computed(() =>
    (partyInventory.value ?? []).filter(i => i.carried_by === member.value.id),
  );

  const knownInfusions = computed(() => {
    const raw = member.value.class_choices?.infusions_known;
    const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
    return names.map(n => ARTIFICER_INFUSIONS_MAP.get(n)).filter(Boolean) as ArtificerInfusion[];
  });

  const infusionSlotsMax = computed(() =>
    member.value.class_resources?.infusion_slots?.max ?? 0,
  );

  const localActiveInfusions = ref<{ name: string; inv_item_id: string | null }[]>([]);

  watch(
    () => [member.value.id, member.value.updated_at],
    () => { localActiveInfusions.value = [...(member.value.active_infusions ?? [])]; },
    { immediate: true },
  );

  function persistActiveInfusions() {
    updateMember({ id: member.value.id, update: { active_infusions: localActiveInfusions.value } });
  }

  const availableInfusionsToLearn = computed(() => {
    const known = new Set(knownInfusions.value.map(i => i.name));
    return ARTIFICER_INFUSIONS.filter(inf =>
      inf.min_level <= artificerLevel.value && !known.has(inf.name),
    );
  });

  function learnInfusion(name: string) {
    const current = member.value.class_choices?.infusions_known;
    const existing: string[] = Array.isArray(current) ? (current as string[]) : current ? [String(current)] : [];
    const newChoices = { ...member.value.class_choices, infusions_known: [...existing, name] };
    updateMember({ id: member.value.id, update: { class_choices: newChoices } });
  }

  function applyInfusion(name: string, invItemId: string | null) {
    localActiveInfusions.value = [...localActiveInfusions.value, { name, inv_item_id: invItemId }];
    persistActiveInfusions();
  }

  function removeActiveInfusionByName(name: string) {
    localActiveInfusions.value = localActiveInfusions.value.filter(a => a.name !== name);
    persistActiveInfusions();
  }

  return {
    isArtificer,
    artificerLevel,
    memberInventoryItems,
    knownInfusions,
    infusionSlotsMax,
    localActiveInfusions,
    availableInfusionsToLearn,
    learnInfusion,
    applyInfusion,
    removeActiveInfusionByName,
  };
}
