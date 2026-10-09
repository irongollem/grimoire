import { computed, type Ref } from "vue";
import { useResolvedSpell } from "@/composables/spells/useSpells";
import { useLibrarySpellArtEntry } from "@/composables/library/useLibrarySpellArt";
import { isUuid } from "@/lib/library/contentIdentity";
import type { Spell } from "@/types/spell.types";

/** The art fields of a library art entry that a spell row can be overlaid with. */
export interface SpellArtOverlay {
  image_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
}

/** A library spell with the user's or canonical art laid over the row's own, where there is any. */
export function withSpellArt(spell: Spell, art: SpellArtOverlay | null | undefined): Spell {
  if (!art) return spell;
  return {
    ...spell,
    image_url: art.image_url ?? spell.image_url,
    image_focal_point: art.portrait_focal_point ?? spell.image_focal_point,
  };
}

/**
 * One spell, resolved, with its art folded in. The modal and the detail page
 * both need it, so it lives here rather than in each of them (the spell twin
 * of `useMonsterWithArt`).
 *
 * One spell's art, not the whole map (#972). Custom spells are uuids and carry
 * their art on their own row, so only a library id asks for an art entry.
 */
export function useSpellWithArt(id: Ref<string>) {
  const { data: art } = useLibrarySpellArtEntry(id, () => !isUuid(id.value));
  const { data, isLoading, isPending, error } = useResolvedSpell(id);

  const isLibrarySpell = computed(() => data.value?.isShared === true);

  const spell = computed<Spell | null>(() => {
    const row = data.value?.spell;
    if (!row) return null;
    return isLibrarySpell.value ? withSpellArt(row, art.value) : row;
  });

  // `isPending` is "no answer yet", including a query paused offline, which
  // `isLoading` (pending and fetching) reads as finished.
  return { spell, isLibrarySpell, isLoading, isPending, error };
}
