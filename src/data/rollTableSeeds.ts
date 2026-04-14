import type { RollTableInsert, RollTableEntry } from "@/types/rollTable.types";

// Seed entries deliberately use only `label` + `notes` — `encounter_id` is
// left blank because we can't guarantee the campaign's bestiary has matching
// Encounter rows yet. The DM can wire entries to real encounters after the
// populate by editing the table.
function entry(min: number, max: number, label: string, notes?: string): RollTableEntry {
  return {
    id: crypto.randomUUID(),
    min,
    max,
    label,
    encounter_id: null,
    count: null,
    notes: notes ?? null,
  };
}

type Seed = Omit<RollTableInsert, "campaign_id" | "notes"> & { notes?: string | null };

export const ROLL_TABLE_SEEDS: Seed[] = [
  {
    name: "Dungeon Level 1–2 — Wandering",
    description: "Low-level dungeon patrols and scavengers. Roll once per hour the party lingers.",
    dice: "1d8",
    entries: [
      entry(1, 1, "1d4 Giant Rats", "Squeezing through a crack in the wall."),
      entry(2, 3, "2 Kobolds on patrol", "Lightly armoured, retreat at half HP."),
      entry(4, 4, "1d4 Giant Centipedes", "Climbing the ceiling, drop on first failed Stealth."),
      entry(5, 5, "Goblin scouting party (1d4 + 1)", "One carries a lantern."),
      entry(6, 6, "Lone wandering Stirge", "Hungry. Surprises on a 1–3."),
      entry(7, 7, "Distant howl, cold draft", "No combat — but morale check next encounter."),
      entry(8, 8, "Shrieker patch ahead", "Triggers if party moves in light."),
    ],
    tags: ["dungeon", "low-level"],
    notes: "Suggested check: every 2 hours of in-dungeon downtime.",
  },

  {
    name: "Forest Road — Daytime",
    description: "Travel encounter for a well-trodden forest road. Roll on each watch.",
    dice: "1d12",
    entries: [
      entry(1,  2,  "Travelling merchant cart", "Friendly. May trade."),
      entry(3,  4,  "Pilgrim group (1d6)", "Heading to a nearby shrine."),
      entry(5,  5,  "Highway bandits (1d4 + 2)", "Demand a toll. Disengage at half."),
      entry(6,  6,  "Wolf pack (1d6)", "Will not attack a strong-looking party."),
      entry(7,  7,  "Wounded courier", "Pursued by something off the road. Quest hook."),
      entry(8,  8,  "Druid + animal companion", "Distracted, may share local rumours."),
      entry(9,  9,  "Owlbear hunting", "Crashing through the underbrush."),
      entry(10, 10, "Cart wreck", "1 day old. Tracks lead off-road."),
      entry(11, 11, "Lone ranger", "Friendly, asks for news."),
      entry(12, 12, "No encounter", "Pleasant uneventful stretch."),
    ],
    tags: ["wilderness", "travel"],
    notes: "Suggested check: every full day of overland travel.",
  },

  {
    name: "Underdark Patrol",
    description: "Deep-tunnel encounter table for any expedition more than a mile underground.",
    dice: "1d20",
    entries: [
      entry(1,  3,  "1d6 Stirges", "Cluster on the ceiling, drop in surprise round."),
      entry(4,  5,  "Drider", "Watching from a high ledge."),
      entry(6,  7,  "Duergar scouts (2d4)", "Invisible until first attack."),
      entry(8,  9,  "Hook Horror", "Hunting echoes."),
      entry(10, 11, "Roper", "Mistaken for a stalagmite."),
      entry(12, 12, "Fungal grove", "Violet fungi (1d4) + shrieker."),
      entry(13, 13, "Mind Flayer", "Cloaked, observing. Flees if engaged."),
      entry(14, 15, "1d4 Quaggoths", "Foraging."),
      entry(16, 17, "Drow patrol (1d4 + 2)", "Prefer ambush."),
      entry(18, 18, "Otyugh", "Wallowing in a refuse pit."),
      entry(19, 19, "Stone Giant lost from above", "Confused, will trade for directions."),
      entry(20, 20, "Echoes only", "No encounter — but DC 14 Wisdom (Insight) reveals being watched."),
    ],
    tags: ["underdark", "high-level"],
    notes: "Check: every 4 hours of travel in deep tunnels.",
  },

  {
    name: "Coastal Cliffs",
    description: "Day or night encounter for travel along sea cliffs.",
    dice: "1d10",
    entries: [
      entry(1,  2,  "1d4 Giant Crabs", "Emerging from tide pools."),
      entry(3,  4,  "Sahuagin scouting party (1d4)", "Climbing the cliff in the dark."),
      entry(5,  5,  "Wrecked ship sighting", "1d4 hours away. Loot or survivors."),
      entry(6,  6,  "Smuggler longboat", "Avoid eye contact."),
      entry(7,  7,  "Storm front", "Cover or ride it out — Constitution save vs exhaustion."),
      entry(8,  8,  "Aarakocra patrol", "Curious, will trade simple words."),
      entry(9,  9,  "Hippogriff hunting", "Aggressive if mounts present."),
      entry(10, 10, "Bottle in the surf", "Sealed letter, hook for next session."),
    ],
    tags: ["coast", "travel"],
  },
];
