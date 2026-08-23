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
      {
        id: "size-space",
        title: "Creature Size & Space",
        columns: ["Size", "Space", "Examples"],
        rows: [
          ["Tiny", "2½ by 2½ ft.", "Imp · sprite"],
          ["Small", "5 by 5 ft.", "Goblin"],
          ["Medium", "5 by 5 ft.", "Human · orc"],
          ["Large", "10 by 10 ft.", "Ogre · horse"],
          ["Huge", "15 by 15 ft.", "Fire giant"],
          ["Gargantuan", "20 by 20 ft. or larger", "Kraken"],
        ],
      },
      {
        id: "object-ac",
        title: "Object Armor Class",
        columns: ["Substance", "AC"],
        rows: [
          ["Cloth, paper, rope", "11"],
          ["Crystal, glass, ice", "13"],
          ["Wood, bone", "15"],
          ["Stone", "17"],
          ["Iron, steel", "19"],
          ["Mithral", "21"],
          ["Adamantine", "23"],
        ],
      },
      {
        id: "object-hp",
        title: "Object Hit Points",
        columns: ["Size", "Fragile", "Resilient"],
        rows: [
          ["Tiny (bottle, lock)", "2 (1d4)", "5 (2d4)"],
          ["Small (chest, lute)", "3 (1d6)", "10 (3d6)"],
          ["Medium (barrel, chandelier)", "4 (1d8)", "18 (4d8)"],
          ["Large (cart, 10-by-10-ft. window)", "5 (1d10)", "27 (5d10)"],
        ],
        note: "Objects are immune to poison and psychic damage. Treat Huge and Gargantuan objects as multiple Large sections.",
      },
      {
        id: "underwater",
        title: "Underwater Combat",
        columns: ["Situation", "Rule"],
        rows: [
          ["Melee attacks", "Disadvantage unless the weapon is a dagger, javelin, shortsword, spear, or trident."],
          ["Ranged attacks", "Automatically miss beyond normal range. Disadvantage within it unless the weapon is a crossbow, a net, or a thrown weapon like a javelin."],
          ["Fire damage", "Creatures and objects fully immersed in water have resistance to it."],
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
      {
        id: "carrying-capacity",
        title: "Carrying Capacity",
        columns: ["Measure", "Rule"],
        rows: [
          ["Carry", "Strength score × 15 lb."],
          ["Push, drag, or lift", "Strength score × 30 lb.; speed drops to 5 ft. while exceeding your carrying capacity."],
          ["Tiny creatures", "Half these amounts."],
          ["Large / Huge / Gargantuan", "×2 / ×4 / ×8 these amounts."],
        ],
      },
      {
        id: "jumping",
        title: "Jumping",
        columns: ["Jump", "Distance"],
        rows: [
          ["Long jump (10-ft. run-up)", "Strength score in feet."],
          ["Long jump (standing)", "Half that."],
          ["High jump (10-ft. run-up)", "3 + Strength modifier feet."],
          ["High jump (standing)", "Half that."],
        ],
        note: "You can reach up 1½ × your height plus the jump's height during a high jump.",
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
      {
        id: "food-water",
        title: "Food & Water",
        columns: ["Need", "Rule"],
        rows: [
          ["Food", "1 lb. per day; go without for 3 + Con modifier days (min 1), then 1 exhaustion per further day. Half rations count as half a day without."],
          ["Water", "1 gallon per day, 2 in hot weather. Half that — DC 15 Con save or a level of exhaustion (automatic on less than half)."],
        ],
      },
      {
        id: "resting",
        title: "Resting",
        columns: ["Rest", "Rule"],
        rows: [
          ["Short rest", "1+ hour; spend Hit Dice to heal."],
          ["Long rest", "8 hours (up to 2 hours light activity); regain all HP and half your total Hit Dice (min 1); one per 24 hours. Interrupted by 1+ hour of walking, fighting, or spellcasting — must restart."],
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
  {
    id: "equipment-services",
    title: "Equipment & Services",
    tables: [
      {
        id: "lifestyle",
        title: "Lifestyle Expenses (per day)",
        columns: ["Lifestyle", "Cost"],
        rows: [
          ["Wretched", "—"],
          ["Squalid", "1 sp"],
          ["Poor", "2 sp"],
          ["Modest", "1 gp"],
          ["Comfortable", "2 gp"],
          ["Wealthy", "4 gp"],
          ["Aristocratic", "10 gp minimum"],
        ],
      },
      {
        id: "food-drink-lodging",
        title: "Food, Drink & Lodging",
        columns: ["Item", "Cost"],
        rows: [
          ["Inn stay (per day)", "Squalid 7 cp · Poor 1 sp · Modest 5 sp · Comfortable 8 sp · Wealthy 2 gp · Aristocratic 4 gp"],
          ["Meals (per day)", "Squalid 3 cp · Poor 6 cp · Modest 3 sp · Comfortable 5 sp · Wealthy 8 sp · Aristocratic 2 gp"],
          ["Ale", "Mug 4 cp · gallon 2 sp"],
          ["Wine", "Common (pitcher) 2 sp · fine (bottle) 10 gp"],
          ["Bread (loaf)", "2 cp"],
          ["Cheese (hunk)", "1 sp"],
          ["Banquet (per person)", "10 gp"],
        ],
      },
      {
        id: "services",
        title: "Services",
        columns: ["Service", "Cost"],
        rows: [
          ["Coach cab, between towns", "3 cp per mile"],
          ["Coach cab, within a city", "1 cp"],
          ["Hireling, skilled", "2 gp per day"],
          ["Hireling, untrained", "2 sp per day"],
          ["Messenger", "2 cp per mile"],
          ["Road or gate toll", "1 cp"],
          ["Ship's passage", "1 sp per mile"],
        ],
      },
      {
        id: "mounts",
        title: "Mounts",
        columns: ["Mount", "Cost", "Speed", "Carrying Capacity"],
        rows: [
          ["Camel", "50 gp", "50 ft.", "480 lb."],
          ["Donkey or mule", "8 gp", "40 ft.", "420 lb."],
          ["Elephant", "200 gp", "40 ft.", "1,320 lb."],
          ["Draft horse", "50 gp", "40 ft.", "540 lb."],
          ["Riding horse", "75 gp", "60 ft.", "480 lb."],
          ["Mastiff", "25 gp", "40 ft.", "195 lb."],
          ["Pony", "30 gp", "40 ft.", "225 lb."],
          ["Warhorse", "400 gp", "60 ft.", "540 lb."],
        ],
      },
      {
        id: "waterborne",
        title: "Waterborne Vehicles",
        columns: ["Vehicle", "Cost", "Speed"],
        rows: [
          ["Galley", "30,000 gp", "4 mph"],
          ["Keelboat", "3,000 gp", "1 mph"],
          ["Longship", "10,000 gp", "3 mph"],
          ["Rowboat", "50 gp", "1½ mph"],
          ["Sailing ship", "10,000 gp", "2 mph"],
          ["Warship", "25,000 gp", "2½ mph"],
        ],
      },
      {
        id: "armor-don-doff",
        title: "Donning & Doffing Armor",
        columns: ["Category", "Don", "Doff"],
        rows: [
          ["Light armor", "1 minute", "1 minute"],
          ["Medium armor", "5 minutes", "1 minute"],
          ["Heavy armor", "10 minutes", "5 minutes"],
          ["Shield", "1 action", "1 action"],
        ],
      },
    ],
  },
];
