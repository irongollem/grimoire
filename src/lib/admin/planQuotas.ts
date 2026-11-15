import type { Plan } from "@/types/subscription.types";

/**
 * The quotas object to write back when the form saves its resources.
 *
 * The column is one jsonb object and the update replaces all of it. Keys the
 * form does not list (#1182's storage ceiling, deliberately never shown) must
 * ride along from the server copy, or a save of an unrelated limit would drop
 * them and a missing key means unlimited.
 */
export function mergeQuotas(serverQuotas: Plan["quotas"], edited: Record<string, number>): Record<string, number> {
  const kept = Object.fromEntries(
    Object.entries(serverQuotas).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
  return { ...kept, ...edited };
}
