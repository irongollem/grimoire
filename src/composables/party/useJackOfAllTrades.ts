import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { useAllCampaignCharacterClasses, useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { jackOfAllTrades, type JackOfAllTrades } from "@/rules/skillCheck";
import type { CharacterClass } from "@/types/multiclass.types";
import type { PartyMember } from "@/types/party.types";

/**
 * One character's Jack of All Trades, from its class rows and its own edition
 * (`member.ruleset`).
 *
 * `jack` is for display: it reads "none" until the rows have loaded, and the
 * number settles the moment they land. A roll must not be scored on that
 * stand-in, because its total goes to chat and is never corrected, so every
 * roll awaits `settledJack()`, which waits for the rows first.
 */
export function useJackOfAllTrades(
  member: MaybeRefOrGetter<Pick<PartyMember, "id" | "ruleset"> | null | undefined>,
) {
  const memberId = computed(() => toValue(member)?.id);
  const query = useCharacterClasses(memberId);
  const jack = computed<JackOfAllTrades>(() => {
    const m = toValue(member);
    const rows = query.data.value;
    if (!m || rows === undefined) return "none";
    return jackOfAllTrades(rows, m.ruleset);
  });
  async function settledJack(): Promise<JackOfAllTrades> {
    const m = toValue(member);
    if (!m) return "none";
    if (query.data.value === undefined) await query.suspense();
    return jack.value;
  }
  return { jack, settledJack };
}

/**
 * Jack of All Trades for every character in the active campaign, for a roster
 * (the Party page, the dashboard widget, Awareness Rolls) that reads the
 * campaign's class rows in one query. Shared, so a page of N rows groups the
 * rows once rather than N times. `jackFor(member)` reads "none" until the rows
 * have loaded; a roll awaits `settled()` first, as with `settledJack` above.
 */
function useCampaignJackOfAllTradesImpl() {
  const query = useAllCampaignCharacterClasses();
  const rowsByMember = computed(() => {
    const rows = query.data.value;
    if (rows === undefined) return null;
    const byMember = new Map<string, CharacterClass[]>();
    for (const row of rows) {
      const list = byMember.get(row.party_member_id);
      if (list) list.push(row);
      else byMember.set(row.party_member_id, [row]);
    }
    return byMember;
  });
  function jackFor(member: Pick<PartyMember, "id" | "ruleset">): JackOfAllTrades {
    const byMember = rowsByMember.value;
    if (byMember === null) return "none";
    const rows = byMember.get(member.id);
    // A character with no class rows is classless, which grants nothing.
    if (rows === undefined) return "none";
    return jackOfAllTrades(rows, member.ruleset);
  }
  async function settled(): Promise<void> {
    if (query.data.value === undefined) await query.suspense();
  }
  /** True once the class rows have loaded, for a caller that snapshots `jackFor` and must not do it early. */
  const ready = computed(() => query.data.value !== undefined);
  return { jackFor, settled, ready };
}

export const useCampaignJackOfAllTrades = createSharedComposable(useCampaignJackOfAllTradesImpl);
