import { ref, computed, watch, type Ref } from "vue";
import { ARTIFICER_INFUSIONS, ARTIFICER_INFUSIONS_MAP } from "@/data/artificerInfusions";
import { useClassOptionTexts, useSaveClassOptionText } from "@/composables/rules/useClassOptionTexts";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import type { PartyMember } from "@/types/party.types";
import type { ArtificerInfusion } from "@/data/artificerInfusions";

interface CharacterClass { class_name: string; levels: number }

/** Infusion mechanics plus the campaign-supplied effect text (Tiptap JSON), if transcribed. */
export interface ArtificerInfusionView extends ArtificerInfusion {
  description: string | null;
}

export function useArtificerState(
  member: Ref<PartyMember>,
  characterClasses: Ref<CharacterClass[] | undefined>,
) {
  const { mutate: updateMember } = useUpdatePartyMember();
  const { data: partyInventory } = usePartyInventory();
  const { textByOption: infusionTexts } = useClassOptionTexts("Artificer", "infusions_known");
  const { mutate: saveOptionText } = useSaveClassOptionText("Artificer", "infusions_known");

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

  const knownInfusions = computed<ArtificerInfusionView[]>(() => {
    const raw = member.value.class_choices?.infusions_known;
    const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
    return names
      .map(n => ARTIFICER_INFUSIONS_MAP.get(n))
      .filter((i): i is ArtificerInfusion => Boolean(i))
      .map(i => ({ ...i, description: infusionTexts.value.get(i.name) ?? null }));
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

  // Infusions known scale with Artificer level: 4 at L2, 6 at L6, 8 at L10,
  // 10 at L14, 12 at L18 (TCoE). Without this cap all infusions were learnable.
  const infusionKnownCap = computed(() => {
    const lvl = artificerLevel.value;
    if (lvl >= 18) return 12;
    if (lvl >= 14) return 10;
    if (lvl >= 10) return 8;
    if (lvl >= 6) return 6;
    if (lvl >= 2) return 4;
    return 0;
  });

  const availableInfusionsToLearn = computed(() => {
    if (knownInfusions.value.length >= infusionKnownCap.value) return [];
    const known = new Set(knownInfusions.value.map(i => i.name));
    return ARTIFICER_INFUSIONS.filter(inf =>
      inf.min_level <= artificerLevel.value && !known.has(inf.name),
    );
  });

  function learnInfusion(name: string) {
    const current = member.value.class_choices?.infusions_known;
    const existing: string[] = Array.isArray(current) ? (current as string[]) : current ? [String(current)] : [];
    if (existing.includes(name) || existing.length >= infusionKnownCap.value) return;
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

  function saveInfusionText(name: string, description: string) {
    saveOptionText({ optionName: name, description });
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
    saveInfusionText,
  };
}
