/**
 * Artificer infusion index — mechanics only, deliberately.
 *
 * The Artificer is not part of any SRD (5.1 or 5.2), so its infusion *effect
 * text* is not licensed for redistribution. What ships here is limited to
 * option names and level gates — game mechanics, not copyrightable expression.
 * The effect descriptions are campaign-supplied content: members transcribe
 * them from their own sourcebooks into `class_option_texts`
 * (see useClassOptionTexts / migration 20260725000003). Do NOT add description
 * strings from published books back into this file.
 */
export interface ArtificerInfusion {
  name: string
  min_level: number
}

export const ARTIFICER_INFUSIONS: ArtificerInfusion[] = [
  // ── Core infusions ────────────────────────────────────────────────────────
  { name: "Armor of Magical Strength", min_level: 2 },
  { name: "Enhanced Arcane Focus", min_level: 2 },
  { name: "Enhanced Defense", min_level: 2 },
  { name: "Enhanced Weapon", min_level: 2 },
  { name: "Homunculus Servant", min_level: 2 },
  { name: "Mind Sharpener", min_level: 2 },
  { name: "Repeating Shot", min_level: 2 },
  { name: "Returning Weapon", min_level: 2 },
  { name: "Boots of the Winding Path", min_level: 4 },
  { name: "Radiant Weapon", min_level: 4 },
  { name: "Many-Handed Pouch", min_level: 6 },
  { name: "Repulsion Shield", min_level: 6 },
  { name: "Resistant Armor", min_level: 6 },
  { name: "Spell-Refueling Ring", min_level: 6 },
  { name: "Arcane Propulsion Armor", min_level: 14 },
  // ── Replicate Magic Item variants ─────────────────────────────────────────
  { name: "Replicate Magic Item: Alchemy Jug", min_level: 2 },
  { name: "Replicate Magic Item: Bag of Holding", min_level: 2 },
  { name: "Replicate Magic Item: Goggles of Night", min_level: 2 },
  { name: "Replicate Magic Item: Rope of Climbing", min_level: 2 },
  { name: "Replicate Magic Item: Sending Stones", min_level: 2 },
  { name: "Replicate Magic Item: Wand of Magic Detection", min_level: 2 },
  { name: "Replicate Magic Item: Boots of Elvenkind", min_level: 6 },
  { name: "Replicate Magic Item: Cloak of Elvenkind", min_level: 6 },
  { name: "Replicate Magic Item: Cloak of Protection", min_level: 6 },
  { name: "Replicate Magic Item: Gloves of Thievery", min_level: 6 },
  { name: "Replicate Magic Item: Helm of Comprehending Languages", min_level: 6 },
  { name: "Replicate Magic Item: Lantern of Revealing", min_level: 6 },
]

export const ARTIFICER_INFUSIONS_MAP = new Map(ARTIFICER_INFUSIONS.map(i => [i.name, i]))
