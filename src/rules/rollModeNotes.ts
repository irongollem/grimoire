import {
  ATTACK_DIS_CONDITIONS,
  CHECK_DIS_CONDITIONS,
  getExhaustionLevel,
} from "@/rules/conditions";
import type { RulesetKey } from "@/types/ruleset.types";

/** The kinds of d20 roll a condition can impose disadvantage on. */
export type DisadvantageTarget = "attack rolls" | "ability checks" | "saving throws" | "Dexterity saving throws";

const TARGET_ORDER: readonly DisadvantageTarget[] = [
  "attack rolls",
  "ability checks",
  "saving throws",
  "Dexterity saving throws",
];

/** The conditions on a character that impose disadvantage, with what each affects. */
function sources(conditions: string[], ruleset: RulesetKey): { name: string; targets: Set<DisadvantageTarget> }[] {
  const out: { name: string; targets: Set<DisadvantageTarget> }[] = [];
  for (const name of conditions) {
    const targets = new Set<DisadvantageTarget>();
    if (ATTACK_DIS_CONDITIONS.has(name)) targets.add("attack rolls");
    if (CHECK_DIS_CONDITIONS.has(name)) targets.add("ability checks");
    if (name === "Restrained") targets.add("Dexterity saving throws");
    if (targets.size > 0) out.push({ name, targets });
  }
  // 2014 Exhaustion is a table of disadvantages; 2024 uses a flat penalty instead.
  const level = getExhaustionLevel(conditions);
  if (ruleset === "2014" && level >= 1) {
    const targets = new Set<DisadvantageTarget>(["ability checks"]);
    if (level >= 3) {
      targets.add("attack rolls");
      targets.add("saving throws");
    }
    out.push({ name: `Exhaustion ${level}`, targets });
  }
  return out;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * The plain sentence saying why a roll starts at disadvantage, limited to the
 * kinds of roll the surface shows ("Poisoned: disadvantage on attack rolls and
 * ability checks."). Conditions with the same effect share a sentence. Empty
 * when nothing imposes disadvantage on those rolls.
 */
export function disadvantageNote(
  conditions: string[],
  ruleset: RulesetKey,
  shown: readonly DisadvantageTarget[],
): string {
  const groups = new Map<string, { names: string[]; targets: DisadvantageTarget[] }>();
  for (const { name, targets } of sources(conditions, ruleset)) {
    const relevant = TARGET_ORDER.filter((t) => targets.has(t) && shown.includes(t));
    if (relevant.length === 0) continue;
    const key = relevant.join("|");
    const group = groups.get(key) ?? { names: [], targets: relevant };
    group.names.push(name);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => `${joinWords(g.names)}: disadvantage on ${joinWords(g.targets)}.`)
    .join(" ");
}
