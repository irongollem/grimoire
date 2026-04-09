import type { PuzzleInsert } from "@/types/puzzle.types";

/** Pre-seeded puzzle room examples. Skips any that already exist by name. */
export const PUZZLE_TEMPLATES: Omit<PuzzleInsert, "image_focal_point">[] = [
  {
    name: "The Three Doors",
    image_url: "/assets/puzzles/three-doors.png",
    puzzle_type: "Logic",
    difficulty: "Medium",
    description:
      "The party enters a circular chamber with three identical iron doors set into the walls. Above each door is carved a single symbol: a sun, a moon, and a star. A stone tablet in the centre of the room bears the inscription:\n\n\"One door leads to life, one to riches, one to ruin. The guardian of the sun always lies. The guardian of the moon always speaks truth. The guardian of the star may do either. Ask, and ye shall choose wisely — or not at all.\"\n\nThree robed figures stand before the doors, faces hidden beneath deep hoods.",
    solution:
      "Players must identify which figure is Sun (liar), Moon (truth-teller), or Star (random) by asking each one a single yes/no question — ideally a self-referential one such as \"If I asked the other two whether your door leads to life, would they both say yes?\"\n\nCorrect door: Moon (truth-teller's door leads to life). The answer is whichever door the Moon-guardian points to when asked a nested truth question. Swap the correct door for your dungeon. The riddle is classic Knights-and-Knaves logic; the key insight is that a truth-teller giving a nested answer about a liar will always invert twice and arrive at truth.",
    hints: [
      { order: 1, text: "The inscription says only one figure always tells the truth." },
      {
        order: 2,
        text: "What would happen if you asked a liar about a truth-teller's answer? The lie about the truth cancels out.",
      },
      {
        order: 3,
        text: "Ask one of them: \"If I asked the Moon guardian whether your door is safe, what would they say?\" A truth-teller will tell you what the Moon guardian would say. A liar will lie about what the Moon guardian would say — which means both routes point to the same answer.",
      },
      {
        order: 4,
        text: "The Moon guardian's door leads to life. Use a double-negative question to find it without knowing who the Moon guardian is.",
      },
    ],
    skill_checks: [
      { skill: "Investigation", dc: 14 },
      { skill: "History", dc: 12 },
      { skill: "Insight", dc: 16 },
    ],
    success_outcome:
      "The chosen door swings open silently to reveal a passage beyond. The three robed figures bow in unison and dissolve into smoke.",
    failure_consequence:
      "If the party chooses the ruin door, it opens to a 10-foot pit (DC 15 DEX save or 2d6 bludgeoning damage). The door seals behind them and the puzzle resets — the correct door changes each reset.",
    tags: ["logic", "riddle", "knights-and-knaves", "classic", "social"],
    notes:
      "Assign the correct door before the session. Hint 3 is effectively the solution — only give it if the party is truly stuck. The three guardians should refuse to answer any question about each other's identities directly.",
  },

  {
    name: "The Celestial Orrery",
    image_url: "/assets/puzzles/arcane-library.png",
    puzzle_type: "Arcane",
    difficulty: "Hard",
    description:
      "The vaulted ceiling of this chamber is painted with a star map. At the centre stands a brass orrery — a mechanical model of the solar system — whose rings, planets, and moons are all frozen in place, encrusted with verdigris.\n\nOn a lectern beside it rests an open tome describing the \"Grand Conjunction\" — a celestial alignment that occurs every 400 years and is said to open the vault of the arch-mage Verandis. An astrological chart shows the correct positions of seven heavenly bodies.\n\nThe orrery has seven concentric rings, each with a gemstone \"planet\" that can be rotated. A faint humming grows louder as correct positions are achieved.",
    solution:
      "Players must rotate each of the seven rings to match the astrological chart in the tome. The correct order (from innermost to outermost ring) is: Mercury → Venus → Earth → Mars → Jupiter → Saturn → the Wandering Star (a fictional eighth body unique to the setting).\n\nEach ring clicks into a notch at 12 equally-spaced positions (like a clock face). The tome's chart shows each body at a specific \"hour\" position. Arcana checks reveal whether a given ring is correctly placed. Once all seven lock, the ceiling map glows and a hidden compartment opens in the lectern base.",
    hints: [
      { order: 1, text: "The tome is the key — the astrological chart is not decorative." },
      {
        order: 2,
        text: "Each ring has 12 notched positions. The chart shows each planet at a specific position as if on a clock face.",
      },
      {
        order: 3,
        text: "Arcana DC 12 after placing a ring: you sense a faint resonance if it is correct.",
      },
      {
        order: 4,
        text: "The Wandering Star (outermost ring) is not in any real catalogue — its position is described only in the final page of the tome, in cipher. The cipher is a simple Caesar shift of 3.",
      },
    ],
    skill_checks: [
      { skill: "Arcana", dc: 15 },
      { skill: "Investigation", dc: 12 },
      { skill: "History", dc: 14 },
    ],
    success_outcome:
      "A resonant chord fills the chamber as all seven gems glow in sequence. The ceiling map blazes with golden light and the compartment in the lectern base clicks open, revealing the arch-mage's personal spellbook and a brass key.",
    failure_consequence:
      "Forcing a ring past its notch or attempting to remove a gem triggers an alarm: a spectral guardian (Arcane Wraith, CR 5) materialises and attacks. It vanishes when reduced to 0 HP or when the party leaves, and the orrery resets.",
    tags: ["arcane", "orrery", "celestial", "mechanics", "investigation"],
    notes:
      "Prepare a physical or digital copy of the astrological chart to hand to the players — it makes the puzzle tactile. The cipher on the final page: shift each letter back 3 (D→A, E→B, etc.). The Wandering Star should be at position 7 (the \"7 o'clock\" notch).",
  },

  {
    name: "The Waterway Vault",
    image_url: "/assets/puzzles/waterway-vault.png",
    puzzle_type: "Physical",
    difficulty: "Easy",
    description:
      "A damp stone room with four stone basins of different sizes, connected by a network of iron channels and stoppered pipes. The basins are labelled I, II, III, and IV (from smallest to largest). Basin IV is bone dry.\n\nA carved inscription on the wall reads: \"Fill the final vessel with precisely eight pints, and the gate shall yield.\"\n\nWater flows freely from a spigot above basin I. A brass dial on the wall shows the current fill level of basin IV. The channel stoppers can be arranged to route water from any basin to any other — but once the water flows, it cannot be recalled.",
    solution:
      "The basins hold 3, 5, 11, and 8 pints respectively (I, II, III, IV). Players must fill basin IV with exactly 8 pints.\n\nSolution (one of several):\n1. Fill basin II (5 pints) from the spigot via basin I.\n2. Pour basin II into basin III (now 5/11).\n3. Fill basin II again (5 pints) from basin I.\n4. Pour basin II into basin III until full (3 more pints, 2 remain in II).\n5. Empty basin III into the drain (or back to basin I via overflow).\n6. Pour the remaining 2 pints from II into III.\n7. Fill basin II again (5 pints). Pour into III (now 7/11).\n8. Pour basin III (7 pints) into basin IV. Done — exactly 8 pints in IV.\n\nAlternate approach: Fill basin III (11 pints), pour into IV until full (8), which leaves 3 in III — but that also works!",
    hints: [
      {
        order: 1,
        text: "You don't need to fill the 11-pint basin to reach 8. Think about which two basins can add up to or leave behind 8 pints.",
      },
      {
        order: 2,
        text: "A simpler route: fill the 11-pint basin completely, then pour water from it into basin IV (8-pint) until it overflows. Whatever fits in IV is exactly 8.",
      },
      {
        order: 3,
        text: "Basin III holds 11 pints. Basin IV holds 8. Fill III to the brim, then pour it directly into IV until IV is full. The overflow is wasted, but IV will contain exactly 8 pints.",
      },
    ],
    skill_checks: [
      { skill: "Investigation", dc: 10 },
      { skill: "Athletics", dc: 8 },
    ],
    success_outcome:
      "The brass dial snaps to 8 and a satisfying clunk echoes through the floor. A section of the wall slides aside to reveal a dry alcove containing a waterproof iron chest.",
    failure_consequence:
      "If the party empties all basins simultaneously (a common mistake), the spigot seals for 1 hour before resetting. There is no damage or combat consequence — just time lost.",
    tags: ["physical", "water", "measurement", "pouring", "classic"],
    notes:
      "This is a low-stakes puzzle good for early dungeons or as a palate cleanser between combat encounters. If players get frustrated, hint 3 is a complete handholding solution — that's intentional for a difficulty-Easy puzzle. The 11→8 direct pour is the intended elegant solution.",
  },
];
