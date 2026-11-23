import { daysWithoutFoodAllowed, hungerExhaustion } from "@/rules/rations";
import { MAX_EXHAUSTION } from "@/rules/conditions";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * Food on a journey for a campaign that counts it (the optional rule `rations`, #1222 decisions 6 and 7).
 * Pure: the dice are injected, so a plan is the same every time it is asked for the same rolls.
 */

/** DMG "Foraging": the Wisdom (Survival) DC by how much the land gives. */
export const FORAGE_TERRAINS = [
  { id: "abundant", label: "Abundant food and water", dc: 10 },
  { id: "limited", label: "Limited food and water", dc: 15 },
  { id: "scarce", label: "Very little food and water", dc: 20 },
] as const;
export type ForageTerrainId = (typeof FORAGE_TERRAINS)[number]["id"];

/** A row that is a day's ration: named for it (library ids vary), still there and not ruined (#1102). */
export function isRationRow(row: Pick<PartyInventoryItem, "name" | "quantity" | "quality">): boolean {
  const name = row.name.trim().toLowerCase();
  return (name === "rations (1 day)" || name.startsWith("rations")) && row.quantity > 0 && row.quality !== "ruined";
}

/**
 * Which ration rows to draw `count` from, and what is left of each (0 means the row goes). Smallest stacks first,
 * so stray single rations are used up before a full bundle is broken into. Takes what there is if `count` is more.
 */
export function takeFromRows<T extends Pick<PartyInventoryItem, "id" | "name" | "quantity" | "quality">>(
  rows: readonly T[],
  count: number,
): { id: string; newQuantity: number }[] {
  const out: { id: string; newQuantity: number }[] = [];
  let left = Math.max(0, Math.floor(count));
  const stacks = rows.filter(isRationRow).sort((a, b) => a.quantity - b.quantity);
  for (const row of stacks) {
    if (left <= 0) break;
    const taken = Math.min(row.quantity, left);
    out.push({ id: row.id, newQuantity: row.quantity - taken });
    left -= taken;
  }
  return out;
}

export interface ProvisionTraveller {
  id: string;
  /** Rations in their own pack. */
  carried: number;
  /** Days in a row they have gone without food as they set out. */
  daysWithoutFood: number;
  /** Exhaustion levels they already have. */
  exhaustion: number;
  conModifier: number;
  ruleset: RulesetKey;
}

export interface Forager {
  id: string;
  survivalBonus: number;
  wisModifier: number;
}

export interface ForageRoll {
  id: string;
  d20: number;
  total: number;
  success: boolean;
  /** Pounds of food found (1d6 + Wisdom modifier, at least 0); 0 on a failure. */
  found: number;
}

export interface TravellerProvisions {
  id: string;
  fromOwn: number;
  fromStash: number;
  fromForage: number;
  /** Days of the journey with nothing to eat. */
  hungryDays: number;
  /** Their run of days without food after the journey. */
  daysWithoutFood: number;
  exhaustionGained: number;
}

export interface ProvisionPlan {
  travellers: TravellerProvisions[];
  fromStash: number;
  forage: { day: number; rolls: ForageRoll[] }[];
}

/**
 * Day by day: foragers roll, then each traveller eats one ration, from that day's forage first (it does not keep,
 * so what is left over is lost), then their own pack, then the party stash. A day with no food adds one to the run
 * without; every day of it past what the edition allows costs a level of Exhaustion (capped at 6 in all).
 */
export function planProvisions(input: {
  days: number;
  travellers: readonly ProvisionTraveller[];
  stash: number;
  forage: { dc: number; foragers: readonly Forager[] } | null;
  roll: (sides: number) => number;
}): ProvisionPlan {
  const state = input.travellers.map((t) => ({
    t,
    carried: t.carried,
    run: t.daysWithoutFood,
    gained: 0,
    out: { id: t.id, fromOwn: 0, fromStash: 0, fromForage: 0, hungryDays: 0, daysWithoutFood: t.daysWithoutFood, exhaustionGained: 0 },
  }));
  let stash = input.stash;
  let stashTaken = 0;
  const forageLog: ProvisionPlan["forage"] = [];
  const days = Math.max(0, Math.floor(input.days));
  for (let day = 1; day <= days; day++) {
    let pool = 0;
    if (input.forage) {
      const rolls = input.forage.foragers.map((f): ForageRoll => {
        const d20 = input.roll(20);
        const total = d20 + f.survivalBonus;
        const success = total >= input.forage!.dc;
        const found = success ? Math.max(0, input.roll(6) + f.wisModifier) : 0;
        return { id: f.id, d20, total, success, found };
      });
      pool = rolls.reduce((sum, r) => sum + r.found, 0);
      forageLog.push({ day, rolls });
    }
    for (const s of state) {
      if (pool > 0) {
        pool -= 1;
        s.out.fromForage += 1;
        s.run = 0;
      } else if (s.carried > 0) {
        s.carried -= 1;
        s.out.fromOwn += 1;
        s.run = 0;
      } else if (stash > 0) {
        stash -= 1;
        stashTaken += 1;
        s.out.fromStash += 1;
        s.run = 0;
      } else {
        s.run += 1;
        s.out.hungryDays += 1;
        const cost = hungerExhaustion(s.run, s.t.conModifier, s.t.ruleset) - hungerExhaustion(s.run - 1, s.t.conModifier, s.t.ruleset);
        s.gained = Math.min(MAX_EXHAUSTION - s.t.exhaustion, s.gained + cost);
      }
    }
  }
  return {
    travellers: state.map((s) => ({ ...s.out, daysWithoutFood: s.run, exhaustionGained: s.gained })),
    fromStash: stashTaken,
    forage: forageLog,
  };
}
