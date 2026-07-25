// Shared hit-point arithmetic. The encounter runner, the DM party tracker and the
// player character sheet all apply damage and healing, and all three have to agree
// on the two rules that are easy to get wrong:
//
//  1. Temporary HP is a buffer in FRONT of the active HP pool — it absorbs damage
//     first. Wild Shape does not remove it, so it absorbs in beast form too.
//  2. While wildshaped, whatever gets past the temp HP hits the beast's HP. If the
//     beast drops to 0 the form ends and the excess carries over to the character's
//     own HP (5e RAW).
//
// See context/features/combat-encounters.md.

export interface HpPools {
  /** The character's own current HP — untouched while a beast form is standing. */
  current_hp: number;
  max_hp: number;
  temp_hp: number;
  /** Active beast form, or null when not wildshaped. */
  beast: { hp: number; max_hp: number } | null;
}

export interface DamageOutcome {
  current_hp: number;
  temp_hp: number;
  /** Beast HP after the hit; null when there is no form, or the form just ended. */
  beast_hp: number | null;
  /** True when this hit dropped the beast form to 0 and reverted it. */
  reverted: boolean;
  /** Damage that reached an HP pool — i.e. what temp HP did not absorb. */
  hp_damage: number;
}

/**
 * Apply `amount` damage across temp HP → beast HP → character HP.
 *
 * `hpFloor` is where the character's own HP bottoms out: 0 for the encounter
 * runner and the player sheet, `-max_hp` for the party tracker, which keeps
 * negative HP visible so the DM can see instant-death overkill.
 */
export function applyDamage(pools: HpPools, amount: number, hpFloor = 0): DamageOutcome {
  const dmg = Math.max(0, amount);
  const absorbed = Math.min(pools.temp_hp, dmg);
  const temp_hp = pools.temp_hp - absorbed;
  const remaining = dmg - absorbed;

  if (pools.beast) {
    const beastHp = pools.beast.hp - remaining;
    if (beastHp > 0) {
      return { current_hp: pools.current_hp, temp_hp, beast_hp: beastHp, reverted: false, hp_damage: remaining };
    }
    // Form drops — the overflow carries to the character's own HP.
    const overflow = -beastHp;
    return {
      current_hp: Math.max(hpFloor, pools.current_hp - overflow),
      temp_hp,
      beast_hp: null,
      reverted: true,
      hp_damage: remaining,
    };
  }

  return {
    current_hp: Math.max(hpFloor, pools.current_hp - remaining),
    temp_hp,
    beast_hp: null,
    reverted: false,
    hp_damage: remaining,
  };
}

export interface HealOutcome {
  current_hp: number;
  /** Beast HP after healing; null when not wildshaped. */
  beast_hp: number | null;
}

/**
 * Apply `amount` healing. Healing never touches temp HP (it is not HP), and
 * while wildshaped it tops up the beast's pool, capped at that form's max.
 */
export function applyHealing(pools: HpPools, amount: number): HealOutcome {
  const heal = Math.max(0, amount);
  if (pools.beast) {
    return {
      current_hp: pools.current_hp,
      beast_hp: Math.min(pools.beast.max_hp, pools.beast.hp + heal),
    };
  }
  return { current_hp: Math.min(pools.max_hp, pools.current_hp + heal), beast_hp: null };
}

/** Temp HP never stacks — a new source replaces the old only if it is larger. */
export function betterTempHp(current: number, incoming: number): number {
  return Math.max(current, Math.max(0, incoming));
}

/** Minimal combatant shape `displayTempHp` needs — kept structural (rather than
 *  importing `RunCombatant`) so this file stays free of app-level type deps. */
export interface TempHpCombatant {
  type: string;
  party_member_id?: string;
  temp_hp?: number;
}

/** Minimal party-member shape `displayTempHp` needs — kept structural (rather
 *  than importing `PartyMember`) for the same reason. */
export interface TempHpPartyMember {
  temp_hp: number;
}

/**
 * Temp HP survives Wild Shape and is spent before the beast's HP, so it is
 * shown in both forms. For players the party row is the authority — the
 * player can grant themselves temp HP on their own sheet mid-encounter, so
 * their live party row (when present) wins over the combatant's own copy.
 */
export function displayTempHp(
  combatant: TempHpCombatant,
  partyMap: Map<string, TempHpPartyMember>,
): number {
  if (combatant.type === "player") {
    const m = partyMap.get(combatant.party_member_id ?? "");
    if (m) return m.temp_hp;
  }
  return combatant.temp_hp ?? 0;
}
