/** The dice a boon adds to an attack roll or a saving throw (#1021), rolled after the d20 for the same creature. See `../boons.ts` for what a boon is. */
import type { RunCombatant } from "../../../types/encounter.types.ts";
import { boonDice } from "../boons.ts";
import type { ResolutionContext, RollOptions } from "./context.ts";

export interface BoonRolls {
  /** What every boon added (or took away) altogether. */
  total: number;
  parts: { name: string; total: number }[];
}

/**
 * Roll each boon the creature carries for this kind of roll. RULE bless (PHB "Bless"): the d4 is rolled and added to the
 * attack roll or saving throw, so it goes on the total and never on the natural d20.
 * The creature is read through `ctx.live`, so a boon that has just ended is not rolled.
 */
export async function rollBoons(ctx: ResolutionContext, roller: RunCombatant, roll: "attack" | "save", opts: RollOptions): Promise<BoonRolls> {
  const live = ctx.live(roller);
  const parts: { name: string; total: number }[] = [];
  for (const boon of boonDice(live.conditions, roll)) {
    const rolled = await ctx.dice({
      counts: boon.counts,
      modifier: 0,
      label: `${boon.name} (${roll === "attack" ? "attack" : "save"})`,
      senderName: live.name,
      rollerId: live.instance_id,
      silent: opts.silent,
    });
    // App convention: nobody rolled it (the DM closed the prompt), so the boon was not rolled and adds nothing.
    parts.push({ name: boon.name, total: rolled === null ? 0 : boon.sign * rolled.result.total + boon.flat });
  }
  return { total: parts.reduce((sum, p) => sum + p.total, 0), parts };
}
