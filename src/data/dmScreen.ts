// ── DM Screen Reference Tables ────────────────────────────────────────────────
// Hardcoded 5e SRD reference data for the DM Screen tab.

export interface ScreenTable {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

export interface ScreenSection {
  id: string;
  title: string;
  tables: ScreenTable[];
}

export const DM_SCREEN_SECTIONS: ScreenSection[] = [
  {
    id: "combat",
    title: "Combat",
    tables: [
      {
        id: "actions",
        title: "Actions in Combat",
        columns: ["Action", "Description"],
        rows: [
          ["Attack", "Make one or more attacks (melee, ranged, or special)."],
          ["Cast a Spell", "Cast a spell with a casting time of 1 action."],
          ["Dash", "Gain extra movement equal to your speed for the turn."],
          ["Disengage", "Your movement doesn't provoke opportunity attacks for the rest of the turn."],
          ["Dodge", "Until your next turn, attacks against you have disadvantage; Dex saves have advantage."],
          ["Help", "Give an ally advantage on their next ability check or attack roll."],
          ["Hide", "Make a Stealth check; if successful, you're hidden."],
          ["Ready", "Hold an action for a defined trigger. Uses your reaction when triggered."],
          ["Search", "Devote attention to finding something (Perception or Investigation check)."],
          ["Use an Object", "Interact with a second object, or use a special object feature."],
        ],
      },
      {
        id: "bonus-actions",
        title: "Common Bonus Actions",
        columns: ["Bonus Action", "Requirement"],
        rows: [
          ["Off-hand Attack", "You took the Attack action and attacked with a light melee weapon."],
          ["Cast a Spell", "Spell has a casting time of 1 bonus action."],
          ["Dash / Disengage / Hide", "Cunning Action (Rogue class feature)."],
          ["Wild Shape", "Druid class feature."],
          ["Second Wind", "Fighter class feature (once per short rest)."],
          ["Bardic Inspiration (give)", "Bard class feature."],
          ["Healing Word", "Spell with bonus action casting time."],
        ],
      },
      {
        id: "reactions",
        title: "Common Reactions",
        columns: ["Reaction", "Trigger"],
        rows: [
          ["Opportunity Attack", "A hostile creature you can see moves out of your reach."],
          ["Cast a Spell", "Spell has a casting time of 1 reaction (e.g. Shield, Counterspell)."],
          ["Uncanny Dodge", "Rogue: attacker you can see hits you — halve the damage."],
          ["Parry", "Battlemaster Manoeuvre: add superiority die to AC against one attack."],
        ],
      },
      {
        id: "cover",
        title: "Cover",
        columns: ["Cover", "Bonus", "Examples"],
        rows: [
          ["Half", "+2 AC and Dex saves", "Low wall, creature, dense foliage"],
          ["Three-Quarters", "+5 AC and Dex saves", "Portcullis, arrow slit, thick trunk"],
          ["Total", "Can't be targeted directly", "Solid wall, closed door"],
        ],
      },
      {
        id: "conditions",
        title: "Conditions",
        columns: ["Condition", "Key Effects"],
        rows: [
          ["Blinded", "Can't see; auto-fail sight checks; attacks against have advantage, your attacks have disadvantage."],
          ["Charmed", "Can't attack charmer; charmer has advantage on social checks against you."],
          ["Deafened", "Can't hear; auto-fail hearing checks."],
          ["Frightened", "Disadvantage on checks/attacks while source is in sight; can't willingly move closer."],
          ["Grappled", "Speed becomes 0. Ends if grappler is incapacitated or you are moved out of reach."],
          ["Incapacitated", "Can't take actions or reactions."],
          ["Invisible", "Can't be seen; attacks against have disadvantage; your attacks have advantage."],
          ["Paralyzed", "Incapacitated, can't move or speak; auto-fail Str/Dex saves; attackers within 5 ft crit."],
          ["Petrified", "Transformed to stone; incapacitated; immune to poison/disease (existing ones paused)."],
          ["Poisoned", "Disadvantage on attack rolls and ability checks."],
          ["Prone", "Disadvantage on attacks; attackers within 5 ft have advantage, ranged have disadvantage; half speed to stand."],
          ["Restrained", "Speed 0; attacks against have advantage; your attacks have disadvantage; disadvantage on Dex saves."],
          ["Stunned", "Incapacitated, can't move; auto-fail Str/Dex saves; attacks against have advantage."],
          ["Unconscious", "Incapacitated, can't move or speak, unaware; drop anything held, fall prone; auto-fail Str/Dex saves; attacks within 5 ft crit."],
        ],
      },
      {
        id: "death-saves",
        title: "Death Saving Throws",
        columns: ["Result", "Effect"],
        rows: [
          ["3 failures", "Character dies."],
          ["3 successes", "Character stabilises (0 HP, unconscious, no longer dying)."],
          ["Natural 1", "Counts as 2 failures."],
          ["Natural 20", "Character regains 1 HP and regains consciousness."],
          ["Damage at 0 HP", "1 death save failure. Crit damage = 2 failures."],
          ["Healing (any)", "Character regains consciousness with HP equal to healing received."],
        ],
      },
    ],
  },
  {
    id: "ability-checks",
    title: "Ability Checks",
    tables: [
      {
        id: "skills",
        title: "Skills by Ability",
        columns: ["Ability", "Skills"],
        rows: [
          ["Strength", "Athletics"],
          ["Dexterity", "Acrobatics · Sleight of Hand · Stealth"],
          ["Intelligence", "Arcana · History · Investigation · Nature · Religion"],
          ["Wisdom", "Animal Handling · Insight · Medicine · Perception · Survival"],
          ["Charisma", "Deception · Intimidation · Performance · Persuasion"],
        ],
      },
      {
        id: "difficulty-class",
        title: "Difficulty Class",
        columns: ["Task Difficulty", "DC"],
        rows: [
          ["Very Easy", "5"],
          ["Easy", "10"],
          ["Medium", "15"],
          ["Hard", "20"],
          ["Very Hard", "25"],
          ["Nearly Impossible", "30"],
        ],
      },
      {
        id: "contests",
        title: "Common Contests",
        columns: ["Situation", "Roll vs Roll"],
        rows: [
          ["Grapple / Escape", "Athletics vs Athletics or Acrobatics"],
          ["Stealth vs Perception", "Stealth vs Passive Perception (or active Perception)"],
          ["Deception vs Insight", "Deception vs Insight"],
          ["Intimidation vs Composure", "Intimidation vs Insight"],
          ["Shove", "Athletics vs Athletics or Acrobatics"],
        ],
      },
    ],
  },
  {
    id: "environment",
    title: "Environment",
    tables: [
      {
        id: "light",
        title: "Light & Vision",
        columns: ["Condition", "Effect"],
        rows: [
          ["Bright Light", "Normal vision."],
          ["Dim Light", "Lightly obscured — disadvantage on Perception checks relying on sight."],
          ["Darkness", "Heavily obscured — effectively blind (auto-fail sight Perception; attacks have disadvantage)."],
          ["Darkvision", "See dim light as bright light, darkness as dim light, within range. No colour in darkness."],
          ["Blindsight", "Perceive surroundings without sight, within range."],
          ["Truesight", "See through darkness, illusions, shapechangers; see into Ethereal Plane."],
        ],
      },
      {
        id: "exhaustion",
        title: "Exhaustion Levels",
        columns: ["Level", "Effect"],
        rows: [
          ["1", "Disadvantage on ability checks."],
          ["2", "Speed halved."],
          ["3", "Disadvantage on attack rolls and saving throws."],
          ["4", "HP maximum halved."],
          ["5", "Speed reduced to 0."],
          ["6", "Death."],
        ],
        note: "Finishing a long rest removes one level of exhaustion (provided you ate and drank).",
      },
      {
        id: "falling",
        title: "Falling & Suffocation",
        columns: ["Situation", "Rule"],
        rows: [
          ["Falling damage", "1d6 bludgeoning per 10 ft., max 20d6. Land prone."],
          ["Falling onto creature", "Target makes DC 15 Dex save or is knocked prone and takes half the fall damage."],
          ["Suffocation", "Can hold breath for 1 + Con modifier minutes (min 30 sec)."],
          ["Suffocating", "Can survive Con modifier rounds (min 1), then drop to 0 HP."],
        ],
      },
      {
        id: "travel-pace",
        title: "Travel Pace",
        columns: ["Pace", "Per Minute", "Per Hour", "Per Day", "Effect"],
        rows: [
          ["Fast", "400 ft.", "4 miles", "30 miles", "−5 to passive Perception."],
          ["Normal", "300 ft.", "3 miles", "24 miles", "—"],
          ["Slow", "200 ft.", "2 miles", "18 miles", "Can use Stealth."],
        ],
      },
    ],
  },
  {
    id: "spellcasting",
    title: "Spellcasting",
    tables: [
      {
        id: "spell-slots",
        title: "Spell Slot Levels by Class Level",
        columns: ["Class Level", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"],
        rows: [
          ["1", "2", "—", "—", "—", "—", "—", "—", "—", "—"],
          ["2", "3", "—", "—", "—", "—", "—", "—", "—", "—"],
          ["3", "4", "2", "—", "—", "—", "—", "—", "—", "—"],
          ["4", "4", "3", "—", "—", "—", "—", "—", "—", "—"],
          ["5", "4", "3", "2", "—", "—", "—", "—", "—", "—"],
          ["6", "4", "3", "3", "—", "—", "—", "—", "—", "—"],
          ["7", "4", "3", "3", "1", "—", "—", "—", "—", "—"],
          ["8", "4", "3", "3", "2", "—", "—", "—", "—", "—"],
          ["9", "4", "3", "3", "3", "1", "—", "—", "—", "—"],
          ["10", "4", "3", "3", "3", "2", "—", "—", "—", "—"],
          ["11", "4", "3", "3", "3", "2", "1", "—", "—", "—"],
          ["13", "4", "3", "3", "3", "2", "1", "1", "—", "—"],
          ["15", "4", "3", "3", "3", "2", "1", "1", "1", "—"],
          ["17", "4", "3", "3", "3", "2", "1", "1", "1", "1"],
          ["20", "4", "3", "3", "3", "2", "1", "1", "1", "1"],
        ],
        note: "Full casters only (Bard, Cleric, Druid, Sorcerer, Wizard). Paladin/Ranger use half; EK/AT use third.",
      },
      {
        id: "concentration",
        title: "Concentration",
        columns: ["Trigger", "Rule"],
        rows: [
          ["Taking damage", "Make a Con save (DC 10 or half damage taken, whichever is higher) or lose concentration."],
          ["Casting another concentration spell", "Lose concentration on the first spell."],
          ["Incapacitated or killed", "Lose concentration immediately."],
          ["War Caster feat", "Advantage on concentration saves."],
          ["Resilient (Con) feat", "Proficiency bonus on concentration saves."],
        ],
      },
    ],
  },
];
