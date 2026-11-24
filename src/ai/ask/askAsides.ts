/**
 * Ask Grimoire (#1270): the quiet lines under a field of the card's form that read the card's own inputs.
 *
 * A contract input names an aside by key (`aside: "encounter_where"`); this file is where that name meets the
 * composable that knows. Each entry is a function that returns a computed line for the inputs held, called once per
 * card from its setup, so a card whose generator names no aside reads nothing. Mirrors `ASK_LISTS` in `askOptions.ts`.
 */
import { computed, type ComputedRef } from "vue";
import { useEncounterWhere } from "@/composables/encounters/useEncounterWhere";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { averagePartyLevel } from "@/lib/quests/hooksPrompt";

export type AskAside = (inputs: () => Readonly<Record<string, unknown>>) => ComputedRef<string | null>;

export const ASK_ASIDES: Readonly<Record<string, AskAside>> = {
  /** Under the encounter's Where: the place's own encounter table, or what lives there. */
  encounter_where: (inputs) => {
    const place = () => {
      const id = inputs().location_id;
      return typeof id === "string" && id !== "" ? id : null;
    };
    const { line } = useEncounterWhere(place, () => place() !== null);
    return computed(() => line.value);
  },
  /** Under the quest giver: the party level the hooks are written for, which the card cannot change (the panel showed it as a read-only line). */
  party_level: () => {
    const { data: party } = useActiveParty();
    return computed(() => {
      const members = party.value;
      if (members === undefined) return null;
      if (members.length === 0) return "No party yet, so the hooks are written for level 1.";
      return `Written for party level ${averagePartyLevel(members.map((m) => m.level))} (average of ${members.length} ${members.length === 1 ? "member" : "members"}).`;
    });
  },
};
