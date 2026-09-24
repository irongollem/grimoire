import { ref } from "vue";
import { useQuota } from "@/composables/billing/useQuota";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { isQuotaExceeded } from "@/lib/quotaError";
import type { QuotaResource } from "@/types/subscription.types";

/**
 * The gate every AI generator that creates a quota-limited entity goes
 * through before it spends anything: free-plan quota first, then credits.
 * Order matters — a DM already at the resource cap must not pay for a
 * result that can't be saved, so `canSpend` checks quota before it ever
 * calls `requireCredits`.
 *
 * `gateQuotaError` covers the other end: the create-time race where the
 * count moved between the pre-check and the save. Catch it around the
 * create call and it turns the raw `quota_exceeded` DB error into the same
 * paywall, instead of surfacing a string the DM can't act on.
 *
 * Pass a `resource` for a generator whose output is itself quota-capped
 * (npcs, factions, locations, monsters, puzzle_rooms, quests, encounters…).
 * Omit it for one whose output isn't (items, spells, traps, roll/loot
 * tables, complications, voice coach…) — `canSpend` then degrades to the
 * credit gate alone.
 *
 * This used to be hand-copied into eight generator panels; one copy (the
 * encounter panel) was missing its pre-check entirely. One place now, so a
 * ninth copy can't drift the same way.
 */
export function useGenerationGate(resource?: QuotaResource) {
  const quota = resource ? useQuota(resource) : null;
  const { requireCredits } = useOutOfCredits();
  const showQuotaPaywall = ref(false);

  function canSpend(cost: number, byok = false): boolean {
    if (quota && !quota.canCreate.value) {
      showQuotaPaywall.value = true;
      return false;
    }
    return requireCredits(cost, byok);
  }

  function gateQuotaError(error: unknown): boolean {
    if (isQuotaExceeded(error)) {
      showQuotaPaywall.value = true;
      return true;
    }
    return false;
  }

  return { showQuotaPaywall, canSpend, gateQuotaError };
}
