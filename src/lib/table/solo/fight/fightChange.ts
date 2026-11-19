/**
 * What the Dungeon Master's ruling does to the fight on the board, as the server sends it once the turn is kept
 * (`supabase/functions/_shared/agent/fightChange.ts` is where it is decided and checked; this is the page's reading
 * of it). The page carries it out, because the page holds the fight.
 */
export interface FightChange {
  costs: "action" | "bonus" | "reaction" | "nothing";
  condition: { target: string; name: string; rounds: number } | null;
  damage: { target: string; amount: number; type: string | null } | null;
  ends: "they_give_in" | "they_flee" | "you_get_away" | null;
}

/** What the player's turn still holds, as the page tells the server with each message sent in a fight. */
export interface FightTurn {
  yours: boolean;
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  words: boolean;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const COSTS = ["action", "bonus", "reaction", "nothing"] as const;
const ENDS = ["they_give_in", "they_flee", "you_get_away"] as const;

/** A change read off the stream, or null when it is not one: a malformed change is never carried out in part. */
export function parseFightChange(raw: unknown): FightChange | null {
  if (!isRecord(raw)) return null;
  const costs = COSTS.find((c) => c === raw.costs);
  if (costs === undefined) return null;
  let condition: FightChange["condition"] = null;
  if (raw.condition !== null && raw.condition !== undefined) {
    const c = raw.condition;
    if (!isRecord(c) || typeof c.target !== "string" || typeof c.name !== "string" || typeof c.rounds !== "number" || !Number.isInteger(c.rounds) || c.rounds < 1) return null;
    condition = { target: c.target, name: c.name, rounds: c.rounds };
  }
  let damage: FightChange["damage"] = null;
  if (raw.damage !== null && raw.damage !== undefined) {
    const d = raw.damage;
    if (!isRecord(d) || typeof d.target !== "string" || typeof d.amount !== "number" || !Number.isInteger(d.amount) || d.amount < 1) return null;
    damage = { target: d.target, amount: d.amount, type: typeof d.type === "string" ? d.type : null };
  }
  const ends = raw.ends === null || raw.ends === undefined ? null : ENDS.find((e) => e === raw.ends);
  if (ends === undefined) return null;
  // A failed attempt changes nothing but what the turn has left; a change that costs nothing and does nothing is none.
  if (condition === null && damage === null && ends === null && costs === "nothing") return null;
  return { costs, condition, damage, ends };
}

/** The line that says how a fight the Dungeon Master ended came to its end. */
export function endLine(ends: NonNullable<FightChange["ends"]>, playedName: string): string {
  if (ends === "they_give_in") return "The fight is over: they give in";
  if (ends === "they_flee") return "The fight is over: they flee";
  return `The fight is over: ${playedName} got away`;
}
