import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useDollArt } from "@/composables/party/useDollArt";
import { dollTokenFigure } from "@/lib/paperDoll/dollTokenFigure";
import type { TokenFigure } from "@/lib/tokenRenderer";
import type { RunCombatant } from "@/types/encounter.types";

/**
 * instance_id -> the paper-doll figure to draw as a party combatant's token
 * (#975). Only a character's OWN doll qualifies: a species or template doll
 * would replace a player's personal portrait with a generic figure. The figure
 * is the outfit the character wears right now, so equipping plate changes the mini.
 */
export function useCombatantDollFigures(combatants: MaybeRefOrGetter<RunCombatant[]>) {
  const { data: party } = useParty();
  const { dollFor } = useDollArt(() => party.value ?? []);

  return computed(() => {
    const figures = new Map<string, TokenFigure>();
    const byId = new Map((party.value ?? []).map((m) => [m.id, m]));
    for (const c of toValue(combatants)) {
      if (!c.party_member_id) continue;
      const member = byId.get(c.party_member_id);
      if (!member) continue;
      const { art, figure } = dollFor(member);
      if (art.source === "character") figures.set(c.instance_id, dollTokenFigure(figure, art.layout.anatomy));
    }
    return figures;
  });
}
