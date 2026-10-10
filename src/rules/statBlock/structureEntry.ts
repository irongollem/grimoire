/**
 * One entry, structured (#1017): keep what a person or an agent already settled,
 * otherwise parse the prose and check the result against it.
 */
import type { ActionStructure } from "../../types/statBlock.types.ts";
import { checkActionAgainstProse } from "./checkAction.ts";
import { type EntryContext, parseActionProse } from "./parseAction.ts";

export function structureEntry(
  entry: { name: string; description: string; structured?: ActionStructure },
  ctx: EntryContext,
): ActionStructure {
  const existing = entry.structured;
  // A DM's structure is never overwritten.
  if (existing?.source === "manual") return existing;
  // An agent's structure survives a re-import for as long as the prose still backs it.
  if (existing?.source === "extracted" && checkActionAgainstProse(entry, existing, ctx.siblings).ok) return existing;

  const parsed = parseActionProse(entry, ctx);
  const result = checkActionAgainstProse(entry, parsed, ctx.siblings);
  if (result.ok) return parsed;

  const kept: ActionStructure = { kind: "other", source: "parsed" };
  for (const key of ["recharge", "uses", "legendary_cost"] as const) {
    const value = parsed[key];
    if (value === undefined) continue;
    const trial = { ...kept, [key]: value };
    if (checkActionAgainstProse(entry, trial, ctx.siblings).ok) Object.assign(kept, { [key]: value });
  }
  return { ...kept, review: result.reason };
}
