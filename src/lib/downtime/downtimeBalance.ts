import type { DowntimeDraw, DowntimeGrant } from "@/types/downtime.types";

/**
 * A character's unspent downtime draws.
 *
 * Derived, never stored, so it cannot drift from the ledger:
 *   balance = sum(grants) − draws that were not cancelled
 *
 * A cancelled draw refunds its credit. A resolved draw does not — it was spent.
 *
 * Clamped at zero: `spend_downtime_draw` re-checks the balance under an advisory
 * lock, so a negative balance is unreachable through the RPC. Clamping keeps a
 * corrupt row from rendering as "-1 draws" rather than papering over a real
 * shortfall, which the RPC would reject anyway.
 */
export function computeBalance(
  grants: readonly DowntimeGrant[],
  draws: readonly DowntimeDraw[],
): number {
  const granted = grants.reduce((sum, g) => sum + g.amount, 0);
  const spent = draws.filter((d) => d.status !== "cancelled").length;
  return Math.max(0, granted - spent);
}
