import { useKnownTo } from "@/composables/canon/useKnownTo";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useOpenSessionId } from "@/composables/canon/useRevealSecret";
import type { CanonEntry } from "@/types/canon.types";

interface Chosen { id: string; name: string }

/** What telling needs of the truth: which one, and whether it was told before (its first stamp is kept). */
type Told = Pick<CanonEntry, "id" | "revealed_at" | "knowledge">;

/**
 * Telling a truth to the party (#1279 item 27): the DM's one tap for "they learned this". The truth is stamped with the
 * time and the session that is running (`revealed_at`, `revealed_session_id`, null when none runs), exactly as a revealed
 * secret is, so it counts as news for the players and appears in "Canon this session". "Tell the party" makes it known
 * to all; "Tell…" makes it known to some and names the chosen characters as knowers (`known_to` links). Telling more
 * later keeps the first time and session: only the audience grows. The caller is the DM's own button, so this asks nothing.
 */
export function useTellTruth(entryId: () => string) {
  const { mutateAsync: update } = useUpdateCanonEntry();
  const openSessionId = useOpenSessionId();
  const { nameKnower } = useKnownTo(entryId);

  /** The stamp: the first telling's, kept if the truth was already told. */
  function stamp(entry: Told) {
    return entry.revealed_at === null
      ? { revealed_at: new Date().toISOString(), revealed_session_id: openSessionId() }
      : {};
  }

  /** Known to all, now. Returns false if the write was refused (the mutation has already told the DM). */
  async function tellParty(entry: Told): Promise<boolean> {
    try {
      await update({ id: entry.id, patch: { knowledge: "all", ...stamp(entry) } });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Known to the characters chosen: each named as a knower, then the truth marked "some". Nothing is written for no one.
   * A truth already known to all stays so: naming knowers never narrows who knows it.
   */
  async function tellSome(entry: Told, members: readonly Chosen[]): Promise<boolean> {
    if (members.length === 0) return false;
    for (const m of members) await nameKnower(entry.id, { kind: "party_member", id: m.id, name: m.name });
    try {
      await update({ id: entry.id, patch: { knowledge: entry.knowledge === "all" ? "all" : "some", ...stamp(entry) } });
      return true;
    } catch {
      return false;
    }
  }

  return { tellParty, tellSome };
}
