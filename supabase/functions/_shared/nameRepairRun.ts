/**
 * The gate and the bookkeeping around repairNames (#1061), effects injected so
 * they are tested under vitest: repair runs only when a TypeSafe key exists,
 * and the spend is recorded once per generation, only when a judgment ran.
 * nameRepairWire.ts supplies the real key read, Jev call and ledger write.
 * Never throws: a failed key read or a failed ledger write leaves the output
 * as the model wrote it.
 *
 * A generator with several kinds of name (a quest's NPCs, places and factions)
 * passes one group per kind, because the client resolves each kind against its
 * own list and a place must never be repaired onto a person.
 */

import { hasUnmatchedName, repairNames, type RepairInput } from "./nameRepair.ts";
import type { JudgeRequest, JudgeResult } from "./typesafe.ts";

export interface RunDeps {
  /** The platform's TypeSafe key, undefined when there is no row (the feature is off). May throw. */
  getKey: () => Promise<string | undefined>;
  judge: (request: JudgeRequest, apiKey: string, signal: AbortSignal) => Promise<JudgeResult>;
  /** Records the free spend. May throw. */
  record: (inputTokens: number) => Promise<void>;
}

/** One repairs map per input group, in the same order. */
export async function repairWhenKeyed(groups: RepairInput[], deps: RunDeps): Promise<Map<string, string>[]> {
  const none = () => groups.map(() => new Map<string, string>());
  if (!groups.some(hasUnmatchedName)) return none();
  let apiKey: string | undefined;
  try {
    apiKey = await deps.getKey();
  } catch (e) {
    console.error("Name repair could not read the typesafe key:", e instanceof Error ? e.message : "unknown error");
    return none();
  }
  if (!apiKey) return none();

  const key = apiKey;
  const results = await Promise.all(
    groups.map((group) => repairNames(group, { judge: (request, signal) => deps.judge(request, key, signal) })),
  );
  const judged = results.reduce((sum, r) => sum + r.judged, 0);
  if (judged > 0) {
    try {
      await deps.record(results.reduce((sum, r) => sum + r.inputTokens, 0));
    } catch (e) {
      console.error("Name repair could not record its spend:", e instanceof Error ? e.message : "unknown error");
    }
  }
  return results.map((r) => r.repairs);
}
