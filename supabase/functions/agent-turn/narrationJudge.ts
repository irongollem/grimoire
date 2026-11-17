// The judge the narration check asks (#1021): TypeSafe's Jev, behind the platform's own key.
//
// Like the Voice Coach's judgments it is an enhancement, never a gate: no key, or a key that cannot be read, means no
// judge, and the handler then shows everything the narrator writes. Each answered call is logged as a platform-paid
// ledger row (delta 0, `entity_judgment`, model `jev-latest`), the way `generate-npc-voice` logs its own, because
// the tokens were spent whatever the verdict.

import { judge, JEV_MODEL, type JudgeResult } from "../_shared/typesafe.ts";
import { judgingKey } from "../import-match/judgeTier.ts";
import type { CreditLogFields } from "../_shared/credits.ts";
import type { NarrationJudge } from "./narration.ts";

export async function narrationJudgeFor(input: {
  getKey: () => Promise<string | undefined>;
  record: (log: CreditLogFields) => Promise<void>;
  signal?: AbortSignal;
  /** Injected by tests. */
  run?: typeof judge;
}): Promise<NarrationJudge | null> {
  let apiKey: string | null = null;
  try {
    // The handler has already refused a campaign with AI switched off, so the switch is on here.
    apiKey = judgingKey(true, await input.getKey());
  } catch (error) {
    console.error("agent-turn: could not read the judging key:", error);
  }
  if (apiKey === null) return null;
  const key = apiKey;
  const run = input.run ?? judge;
  return async (request): Promise<JudgeResult> => {
    const result = await run(request, { apiKey: key, signal: input.signal });
    // A failure to log costs a ledger row, never the judgment.
    try {
      await input.record({ model: JEV_MODEL, provider: "typesafe", input_tokens: result.inputTokens });
    } catch (error) {
      console.error("agent-turn: logging the narration check failed:", error);
    }
    return result;
  };
}
