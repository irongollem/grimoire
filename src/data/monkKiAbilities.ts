export interface KiAbility {
  name: string;
  min_level: number;
  ki_cost: number;
  timing: string;
  description: string;
}

export const MONK_KI_ABILITIES: KiAbility[] = [
  {
    name: "Flurry of Blows",
    min_level: 2,
    ki_cost: 1,
    timing: "After Attack action",
    description: "Make two unarmed strikes as a bonus action.",
  },
  {
    name: "Patient Defense",
    min_level: 2,
    ki_cost: 1,
    timing: "Bonus action",
    description: "Take the Dodge action as a bonus action.",
  },
  {
    name: "Step of the Wind",
    min_level: 2,
    ki_cost: 1,
    timing: "Bonus action",
    description:
      "Take the Disengage or Dash action as a bonus action. Your jump distance is doubled for the turn.",
  },
  {
    name: "Stunning Strike",
    min_level: 5,
    ki_cost: 1,
    timing: "After hitting with a melee weapon attack",
    description:
      "Force the target to make a Constitution saving throw (DC = 8 + prof + WIS mod). On a fail, it is stunned until the end of your next turn.",
  },
  {
    name: "Deflect Missiles",
    min_level: 3,
    ki_cost: 1,
    timing: "Reaction (when hit by ranged weapon attack)",
    description:
      "Reduce damage by 1d10 + DEX + monk level. If damage reaches 0, catch the projectile and make a ranged attack with it (range 20/60).",
  },
  {
    name: "Shadow Step",
    min_level: 6,
    ki_cost: 0,
    timing: "Bonus action (Way of Shadow)",
    description:
      "Teleport up to 60 ft between areas of dim light or darkness. Gain advantage on the first melee attack before the end of your turn.",
  },
  {
    name: "Empty Body",
    min_level: 18,
    ki_cost: 4,
    timing: "Action",
    description:
      "Become invisible for 1 minute. During this time you also have resistance to all damage except force. Spend 8 ki to cast Astral Projection instead.",
  },
  {
    name: "Perfect Self",
    min_level: 20,
    ki_cost: 0,
    timing: "Initiative roll",
    description:
      "If you have 0 ki points when rolling initiative, regain 4 ki points.",
  },
];
