import type { DyingOutcome } from "@/rules/dying";
import type { ResolvedAction, ResolvedSave } from "@/rules/fight/fightState";

/**
 * One short plain sentence for what a resolved action came to, for the line a DM reads under "Run this turn for me"
 * (#1203). It quotes only the numbers the summary holds.
 */
export function describeResolvedAction(resolved: ResolvedAction, nameOf: (instanceId: string) => string): string {
  switch (resolved.kind) {
    case "attack": {
      const verdict = resolved.hit ? (resolved.critical ? "critical hit" : "hit") : resolved.fumble ? "miss (a natural 1)" : "miss";
      const head = `${nameOf(resolved.attackerId)} attacks ${nameOf(resolved.targetId)} with ${resolved.action}: ${verdict}, ${resolved.total} against AC ${resolved.targetAc}`;
      const hurt = resolved.hit && resolved.damageTotal > 0 ? `, ${resolved.damageTotal} damage${dyingWords(resolved.dying)}` : "";
      const rider = resolved.save ? ` ${saveWords(resolved.save, nameOf)}` : "";
      return `${head}${hurt}.${rider}`;
    }
    case "save": {
      const who = resolved.targets.map((t) => saveWords(t, nameOf)).join(" ");
      return `${nameOf(resolved.attackerId)} uses ${resolved.action} (DC ${resolved.dc} ${resolved.ability.toUpperCase()} save). ${who}`.trim();
    }
    case "cast":
      return `${nameOf(resolved.casterId)} casts ${resolved.spell}. ${resolved.why}`;
    case "heal": {
      const who = resolved.targets.map((t) => {
        if (t.unaffected) return `${nameOf(t.targetId)} is not affected`;
        const ended = t.ended !== undefined && t.ended.length > 0 ? `, and is no longer ${t.ended.join(" or ")}` : "";
        return `${nameOf(t.targetId)} regains ${t.regained} hit points${t.revived ? " and is back on their feet" : ""}${ended}`;
      }).join("; ");
      const table = resolved.leftToTable !== undefined && resolved.leftToTable.length > 0 ? ` The table rules on ${resolved.leftToTable.join(" and ")}.` : "";
      const amount = resolved.pool === true ? `${resolved.rolled} hit points to share` : `${resolved.rolled} rolled`;
      return `${nameOf(resolved.casterId)} casts ${resolved.spell} (${amount}): ${who}.${table}`;
    }
    case "concentration":
      return `${nameOf(resolved.instanceId)} ${resolved.maintained ? "keeps" : "loses"} concentration (${resolved.total} against DC ${resolved.dc}).`;
    case "condition_save":
      return `${nameOf(resolved.instanceId)} ${resolved.success ? "shakes off" : "stays under"} ${resolved.name} (DC ${resolved.dc}).`;
    case "break_free":
      return `${nameOf(resolved.instanceId)} tries to break free of ${resolved.name} with a ${resolved.ability.toUpperCase()} check: ${resolved.total} (a ${resolved.natural} on the die) against DC ${resolved.dc}, ${resolved.success ? "and is free" : "and stays held"}.`;
    case "ongoing_damage":
      return `${nameOf(resolved.instanceId)} takes ${resolved.damageTotal} damage from ${resolved.name}${dyingWords(resolved.dying)}.`;
  }
}

function saveWords(save: ResolvedSave, nameOf: (instanceId: string) => string): string {
  const roll = save.autoFail ? "fails automatically" : `${save.success ? "makes" : "fails"} the save${save.total === null ? "" : ` (${save.total})`}`;
  const hurt = save.damageTotal > 0 ? `, takes ${save.damageTotal} damage${dyingWords(save.dying)}` : "";
  return `${nameOf(save.targetId)} ${roll}${hurt}.`;
}

function dyingWords(outcome: DyingOutcome): string {
  if (outcome === "died") return " and dies";
  if (outcome === "dropped") return " and drops to 0 hit points";
  return "";
}
