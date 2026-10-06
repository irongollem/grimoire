import { toValue, type MaybeRefOrGetter } from "vue";
import { templateSizeFor, type DollOutfit } from "@edge-shared/paperDoll/types.ts";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { outfitPicture, pickDollArt, type DollArt, type DollPicture } from "@/lib/paperDoll/dollStack";
import { dollOutfitFor } from "@/lib/paperDoll/outfit";
import type { PartyMember } from "@/types/party.types";

export interface MemberDoll {
  art: DollArt;
  /** The figure in the outfit it wears now. */
  figure: DollPicture;
  outfit: DollOutfit;
}

/**
 * What to draw for each character's paper doll (#975): the art it falls back
 * through (own, species, size template) and the figure for what it wears.
 * Plain functions over reactive state, so templates and computeds can call them.
 */
export function useDollArt(members: MaybeRefOrGetter<PartyMember[]>) {
  const { data: speciesById } = useSpeciesByIds(() => toValue(members).map((m) => m.species_id));
  const { wornGearFor } = useArmorClass();

  /** Resolve the member's art and worn outfit from the currently loaded species and gear. */
  function dollFor(member: PartyMember): MemberDoll {
    const species = member.species_id ? speciesById.value.get(member.species_id) : undefined;
    const art = pickDollArt(member.doll, species?.doll, templateSizeFor(species?.size));
    const outfit = dollOutfitFor(wornGearFor(member.id));
    return { art, outfit, figure: outfitPicture(art, outfit) };
  }

  return { dollFor };
}
