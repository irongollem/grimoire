export interface BattleManeuver {
  name: string;
  timing: string;
  description: string;
}

export const BATTLE_MASTER_MANEUVERS: BattleManeuver[] = [
  {
    name: "Commander's Strike",
    timing: "When you take the Attack action",
    description:
      "Forgo one attack and use a bonus action to direct an ally. That ally uses their reaction to make one weapon attack, adding your superiority die to the damage roll.",
  },
  {
    name: "Disarming Attack",
    timing: "When you hit with a weapon attack",
    description:
      "Expend one superiority die and add it to damage. The target must make a Strength saving throw or drop one item of your choice.",
  },
  {
    name: "Distracting Strike",
    timing: "When you hit with a weapon attack",
    description:
      "Expend one superiority die and add it to damage. The next attack roll against the target by someone other than you has advantage before the start of your next turn.",
  },
  {
    name: "Evasive Footwork",
    timing: "When you move",
    description: "Expend one superiority die and add it to your AC until you stop moving.",
  },
  {
    name: "Feinting Attack",
    timing: "Bonus action on your turn",
    description:
      "Expend one superiority die to feint against one creature within 5 ft. You have advantage on your next attack roll against that creature this turn, and add the die to damage if you hit.",
  },
  {
    name: "Goading Attack",
    timing: "When you hit with a weapon attack",
    description:
      "Expend one superiority die and add it to damage. The target must make a Wisdom saving throw or have disadvantage on attacks against creatures other than you until the start of your next turn.",
  },
  {
    name: "Lunging Attack",
    timing: "When you make a melee weapon attack on your turn",
    description:
      "Expend one superiority die to increase your reach by 5 ft. If you hit, add the superiority die to damage.",
  },
  {
    name: "Maneuvering Attack",
    timing: "When you hit with a weapon attack",
    description:
      "Expend one superiority die and add it to damage. Choose a friendly creature who can see or hear you. That creature can use its reaction to move up to half its speed without provoking opportunity attacks from the target.",
  },
  {
    name: "Menacing Attack",
    timing: "When you hit with a weapon attack",
    description:
      "Expend one superiority die and add it to damage. The target must make a Wisdom saving throw or be frightened of you until the end of your next turn.",
  },
  {
    name: "Parry",
    timing: "Reaction (when damaged by a melee attack)",
    description:
      "Expend one superiority die to reduce the damage by the roll + your Dexterity modifier.",
  },
  {
    name: "Precision Attack",
    timing: "When you make a weapon attack roll",
    description: "Expend one superiority die and add it to the attack roll.",
  },
  {
    name: "Pushing Attack",
    timing: "When you hit with a weapon attack",
    description:
      "Expend one superiority die and add it to damage. The target must make a Strength saving throw or be pushed up to 15 ft away from you.",
  },
  {
    name: "Rally",
    timing: "Bonus action on your turn",
    description:
      "Expend one superiority die to bolster an ally within 60 ft who can hear you. That ally gains temporary hit points equal to the roll + your Charisma modifier.",
  },
  {
    name: "Riposte",
    timing: "Reaction (when a creature misses you with a melee attack)",
    description:
      "Expend one superiority die to make one melee weapon attack. If you hit, add the superiority die to damage.",
  },
  {
    name: "Sweeping Attack",
    timing: "When you hit with a melee weapon attack",
    description:
      "Expend one superiority die. If the roll is equal to or lower than damage dealt, deal that much damage to a different creature within 5 ft of the original target.",
  },
  {
    name: "Trip Attack",
    timing: "When you hit with a weapon attack",
    description:
      "Expend one superiority die and add it to damage. If the target is Large or smaller, it must make a Strength saving throw or be knocked prone.",
  },
];

export const BATTLE_MASTER_MANEUVER_NAMES = BATTLE_MASTER_MANEUVERS.map((m) => m.name);
export const BATTLE_MASTER_MANEUVERS_MAP = new Map(
  BATTLE_MASTER_MANEUVERS.map((m) => [m.name, m]),
);
