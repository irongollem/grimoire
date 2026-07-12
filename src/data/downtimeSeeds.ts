import type { DowntimeSeed } from "@/types/downtime.types";

/**
 * System seed content for The Interlude (#486).
 *
 * These are *templates*: a resolved draw clones one into the campaign as an
 * ordinary, private, fully-editable row owned by the DM — an NPC, an item, or a
 * note, depending on `reward.kind`. Nothing canonical is ever stored, so the
 * `srd/` storage + `is_app_admin()` rules do not apply here. The moment we ship
 * curated per-seed artwork, this must become an `srd_*` table with the `srd/`
 * storage policy in the same migration.
 *
 * A seed proposes a vignette and, sometimes, a consequence. The DM decides how
 * dark their world is — nothing here is applied without an explicit tick on the
 * resolution board, and only coin, HP, and conditions are ever applied
 * automatically (see `downtimeEffects.ts`).
 */
export const DOWNTIME_SEEDS: DowntimeSeed[] = [
  // ── Carouse → NPC contacts ──────────────────────────────────────────────────
  {
    id: "carouse-fence",
    activityKey: "carouse",
    weight: 3,
    title: "A friend in low places",
    vignette:
      "Three drinks in, the quiet one at the end of the bar finally speaks. She does not ask your name, and she does not offer hers — but she names a price for the kind of goods that never see a market stall, and she says it like an invitation.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "A night of buying rounds to earn the introduction.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: -5,
        pp: 0,
      },
    ],
    reward: {
      kind: "npc",
      npc: {
        name: "Sela Quillfeather",
        race: "Half-elf",
        alignment: "Neutral",
        occupation: "Fence",
        appearance:
          "Wiry, grey-eyed, forever turning a copper coin over her knuckles. Dresses one notch too well for the tavern she drinks in.",
        personality:
          "Speaks in prices. Never lies outright, because a reputation is worth more than any single score.",
        backstory:
          "Moves stolen goods for half the district and launders the rest through a cousin's pawnshop. Owes the party a favour after they bought her silence with a night's drinking.",
        relationship: "indifferent",
        tags: ["underworld", "contact", "carouse"],
      },
    },
  },
  {
    id: "carouse-rival-duelist",
    activityKey: "carouse",
    weight: 2,
    title: "First blood, no hard feelings",
    vignette:
      "You beat him at cards. He challenged you to arm-wrestle. You beat him at that too. Somewhere around the fourth contest, the tavern started taking bets — and somewhere around the sixth, he started laughing. He'll be looking for you next time.",
    proposedEffects: [
      {
        kind: "hp",
        applied: false,
        note: "A bruised rib from the arm-wrestling, worth roleplaying but not tracking.",
        delta: -2,
      },
    ],
    reward: {
      kind: "npc",
      npc: {
        name: "Corvin Ashglass",
        race: "Human",
        alignment: "Chaotic neutral",
        occupation: "Duelist",
        appearance:
          "Broad-shouldered, sunburnt, a duelling scar he is far too proud of. Laughs with his whole chest.",
        personality:
          "Competitive about everything, resentful about nothing. Treats defeat as the opening move of a friendship.",
        backstory:
          "A minor noble's third son with no inheritance and no plans. Wanders from tavern to tavern looking for someone who can beat him.",
        relationship: "friendly",
        tags: ["rival", "contact", "carouse"],
      },
    },
  },
  {
    id: "carouse-disgraced-sage",
    activityKey: "carouse",
    weight: 2,
    title: "In vino, veritas",
    vignette:
      "The old man in the corner has been nursing the same cup for two hours. When you sit down, he tells you — unprompted, and in considerable detail — exactly why he was dismissed from the academy. Halfway through, you realise he is not raving.",
    proposedEffects: [],
    reward: {
      kind: "npc",
      npc: {
        name: "Emeric Vann",
        race: "Human",
        alignment: "Neutral good",
        occupation: "Disgraced scholar",
        appearance:
          "Threadbare academic robes, ink-stained fingers, spectacles mended with wire. Older than his years.",
        personality:
          "Precise, apologetic, and utterly incapable of leaving a factual error uncorrected.",
        backstory:
          "Expelled for publishing a translation the academy preferred buried. He still has the source text, and he is looking for someone brave enough to read it.",
        relationship: "friendly",
        tags: ["lore", "contact", "carouse"],
      },
    },
  },
  {
    id: "carouse-guild-recruiter",
    activityKey: "carouse",
    weight: 2,
    title: "We've been watching you",
    vignette:
      "She buys the round before you notice she is there, and by the time you do she already knows what you did last season and roughly what you were paid for it. The guild, she explains, pays better. The guild also asks more.",
    proposedEffects: [],
    reward: {
      kind: "npc",
      npc: {
        name: "Marisette Dow",
        race: "Halfling",
        alignment: "Lawful neutral",
        occupation: "Guild recruiter",
        appearance:
          "Immaculate, unhurried, a ledger always within arm's reach. Smiles precisely as much as the conversation requires.",
        personality:
          "Warm on the surface, transactional underneath. Remembers every name and exactly what it is worth.",
        backstory:
          "Recruits for a guild whose name she will not say aloud in a public house. Her offer is genuine; the terms are not generous.",
        relationship: "indifferent",
        tags: ["faction", "contact", "carouse"],
      },
    },
  },
  {
    id: "carouse-debt-collector",
    activityKey: "carouse",
    weight: 1,
    title: "A tab you don't remember running up",
    vignette:
      "You wake with a splitting head and a signed note in your handwriting, promising a sum you would not have agreed to sober. The man holding the other half of it is very polite about the whole thing, which is somehow worse.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "The tab, as written. Waive it if your table prefers a kinder world.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: -25,
        pp: 0,
      },
    ],
    reward: {
      kind: "npc",
      npc: {
        name: "Bran Otwell",
        race: "Human",
        alignment: "Lawful neutral",
        occupation: "Debt collector",
        appearance:
          "Unremarkable in every way, which is the point. Soft voice, immaculate ledger, two large friends who never speak.",
        personality:
          "Scrupulously fair and entirely without mercy. Would rather be paid than be owed.",
        backstory:
          "Collects for whoever pays him. Holds your marker, and will hold it patiently — with interest — for as long as it takes.",
        relationship: "unfriendly",
        tags: ["debt", "complication", "carouse"],
      },
    },
  },
  {
    id: "carouse-flirtatious-noble",
    activityKey: "carouse",
    weight: 1,
    title: "Slumming it",
    vignette:
      "Nobody dressed like that drinks in a place like this by accident. They are bored, they are charming, and they are asking rather more questions about your work than idle curiosity would explain.",
    proposedEffects: [],
    reward: {
      kind: "npc",
      npc: {
        name: "Lucien Voss",
        race: "Human",
        alignment: "Chaotic neutral",
        occupation: "Bored noble",
        appearance:
          "Beautifully dressed and deliberately underdressed for their station. A signet ring turned inward, hiding the crest.",
        personality:
          "Delightful company, wholly unreliable, and genuinely surprised when anyone minds.",
        backstory:
          "Escapes an arranged betrothal one tavern at a time. Their family would pay well to know where they drink — which makes knowing them dangerous.",
        relationship: "friendly",
        tags: ["noble", "contact", "carouse"],
      },
    },
  },

  // ── Craft & Enchant → items ─────────────────────────────────────────────────
  {
    id: "craft-masterwork-tool",
    activityKey: "craft",
    weight: 3,
    title: "The right tool, made right",
    vignette:
      "You spend the interlude at a borrowed bench, and by the end of it you have something better than you could buy: a tool balanced to your own hand, its maker's mark quietly your own.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "Raw stock and a share of the forge's coal.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: -15,
        pp: 0,
      },
    ],
    reward: {
      kind: "item",
      item: {
        name: "Masterwork Artisan's Tools",
        item_type: "tool",
        subtype: null,
        rarity: "common",
        requires_attunement: false,
        weight: 5,
        cost: "50 gp",
        description:
          "A set of tools worked to a fit no shop-bought kit can match — balanced, quiet, and unmistakably yours. Grants advantage on checks made to repeat the craft that made them, at the DM's discretion.",
        tags: ["crafted", "tool"],
      },
    },
  },
  {
    id: "craft-minor-trinket",
    activityKey: "craft",
    weight: 2,
    title: "A little magic, bound patiently",
    vignette:
      "It took the whole interlude and most of your patience, but the trinket holds its charm now — a small, honest enchantment that does one thing and does it well.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "Reagents and a scrap of something rare.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: -40,
        pp: 0,
      },
    ],
    reward: {
      kind: "item",
      item: {
        name: "Handmade Charm",
        item_type: "wondrous_item",
        subtype: null,
        rarity: "uncommon",
        requires_attunement: false,
        weight: 0,
        cost: null,
        description:
          "A modest enchanted trinket of your own making. Pick one minor, always-on effect with the DM — a light that never gutters, a compass that finds home, a coin that always lands true once a day.",
        tags: ["crafted", "wondrous"],
      },
    },
  },
  {
    id: "craft-sturdy-blade",
    activityKey: "craft",
    weight: 2,
    title: "Folded, quenched, and true",
    vignette:
      "No magic in it — just good steel, folded and quenched by someone who cared how it turned out. It will hold an edge long after cheaper work has chipped.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "Steel stock and the smith's indulgence.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: -10,
        pp: 0,
      },
    ],
    reward: {
      kind: "item",
      item: {
        name: "Well-Forged Blade",
        item_type: "weapon",
        subtype: "longsword",
        rarity: "common",
        requires_attunement: false,
        weight: 3,
        cost: "15 gp",
        description:
          "A longsword of honest, careful make. No enchantment — but it will never be the thing that fails you.",
        tags: ["crafted", "weapon"],
      },
    },
  },

  // ── Research & Scribe → notes ───────────────────────────────────────────────
  {
    id: "research-lore-fragment",
    activityKey: "research",
    weight: 3,
    title: "A thread worth pulling",
    vignette:
      "Buried in a stack no one had touched in years, a single passage stops you cold — a name you know, in a context you didn't expect, pointing somewhere you hadn't thought to look.",
    proposedEffects: [],
    reward: {
      kind: "note",
      note: {
        title: "Research: a thread worth pulling",
        body: "During the interlude you turned up a fragment of lore connecting a name your party already knows to something older. Fill in the specifics for your world — but the thread is real, and it leads somewhere.",
        category: "lore",
        tags: ["research", "lore"],
      },
    },
  },
  {
    id: "research-map-clue",
    activityKey: "research",
    weight: 2,
    title: "The map lies, but consistently",
    vignette:
      "Three old charts disagree about the same stretch of coast — and the way they disagree tells you exactly what someone went to trouble to hide.",
    proposedEffects: [],
    reward: {
      kind: "note",
      note: {
        title: "Research: a discrepancy in the maps",
        body: "Cross-referencing old maps surfaced a deliberate omission — a place edited out of the record. Note where you think it points; the party now has a lead only careful research could have found.",
        category: "lore",
        tags: ["research", "location", "clue"],
      },
    },
  },
  {
    id: "research-copied-spell",
    activityKey: "research",
    weight: 2,
    title: "A page worth copying",
    vignette:
      "The archive would not let the book leave — but it said nothing about your own ink and a steady hand. By the end of the interlude the working is yours, transcribed and legible.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "Fine ink and a scribe's-desk fee.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: -20,
        pp: 0,
      },
    ],
    reward: {
      kind: "note",
      note: {
        title: "Research: a transcribed working",
        body: "You copied out a spell, ritual, or formula found in the archives. Decide with the DM what it is and whether it's yet usable — but the transcription itself is done and in your hands.",
        category: "lore",
        tags: ["research", "spell", "transcription"],
      },
    },
  },

  // ── Train → notes ───────────────────────────────────────────────────────────
  {
    id: "train-proficiency-log",
    activityKey: "train",
    weight: 3,
    title: "Reps, and then more reps",
    vignette:
      "It is not glamorous. It is a season of early mornings and aching muscles and one small correction repeated a thousand times — until the thing you could not do becomes the thing you no longer think about.",
    proposedEffects: [],
    reward: {
      kind: "note",
      note: {
        title: "Training log",
        body: "A season of focused practice toward a proficiency, tool, language, or feat-gate the DM has set. Record the goal and the progress here; whether it's *complete* is the DM's call, but the work is on the books.",
        category: "general",
        tags: ["training", "downtime"],
      },
    },
  },
  {
    id: "train-language-primer",
    activityKey: "train",
    weight: 2,
    title: "Borrowed tongue",
    vignette:
      "A patient tutor, a stack of flash-scribbled cards, and a great deal of being politely corrected. You are not fluent. You are further along than you were.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "The tutor's fee for the season.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: -25,
        pp: 0,
      },
    ],
    reward: {
      kind: "note",
      note: {
        title: "Training: language primer",
        body: "You spent the interlude studying a language under a tutor. Note which one and how far you got — enough to read a sign and haggle badly, if not yet to pass as a native.",
        category: "general",
        tags: ["training", "language"],
      },
    },
  },

  // ── Run a Business → notes (+ coin swings) ──────────────────────────────────
  {
    id: "business-good-quarter",
    activityKey: "business",
    weight: 3,
    title: "The ledger, in black",
    vignette:
      "Nothing dramatic happened, which is exactly what you wanted. The doors opened, the coin came in, and at the end of the interlude the books balance in your favour.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "A quiet, profitable quarter.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 60,
        pp: 0,
      },
    ],
    reward: {
      kind: "note",
      note: {
        title: "Business: a quarter in the black",
        body: "Your shop, shrine, or cell turned a steady profit this interlude. Log the takings and any regulars worth remembering — the enterprise is becoming part of the world.",
        category: "faction",
        tags: ["business", "income"],
      },
    },
  },
  {
    id: "business-robbed",
    activityKey: "business",
    weight: 1,
    title: "You were away when it happened",
    vignette:
      "The lock was forced, the strongbox is lighter, and the neighbours all suddenly remember seeing nothing. Whoever did it knew when you'd be gone.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "What the strongbox held. A hook, not just a loss.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: -40,
        pp: 0,
      },
    ],
    reward: {
      kind: "note",
      note: {
        title: "Business: robbed while away",
        body: "Someone hit your enterprise while the party was out. Note what was taken and who might have known your schedule — a complication that owes you an answer.",
        category: "faction",
        tags: ["business", "complication", "hook"],
      },
    },
  },

  // ── Pit Fighting → items (+ injuries) ───────────────────────────────────────
  {
    id: "pit-champion-purse",
    activityKey: "pit-fighting",
    weight: 2,
    title: "The crowd got their money's worth",
    vignette:
      "You went the distance and then some. The purse is heavy, the crowd chanted a name that might have been yours, and the ache in your side says you earned every coin.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "The winner's purse.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 75,
        pp: 0,
      },
      {
        kind: "hp",
        applied: false,
        note: "You won, but not cleanly.",
        delta: -6,
      },
    ],
    reward: {
      kind: "item",
      item: {
        name: "Champion's Token",
        item_type: "art_object",
        subtype: null,
        rarity: "common",
        requires_attunement: false,
        weight: 0,
        cost: "25 gp",
        description:
          "A carved token handed to the winner of the pit — worth a little coin, worth more as proof. Doors open for someone who can produce one of these.",
        tags: ["pit-fighting", "trophy"],
      },
    },
  },
  {
    id: "pit-brutal-bout",
    activityKey: "pit-fighting",
    weight: 2,
    title: "You lost, but you didn't fold",
    vignette:
      "The other one was faster than the odds said. You still walked out on your own feet, a confiscated blade in your fist that nobody stepped up to reclaim — and a limp you'll be nursing for days.",
    proposedEffects: [
      {
        kind: "hp",
        applied: false,
        note: "A real beating. Heal it or roleplay it.",
        delta: -12,
      },
      {
        kind: "condition",
        applied: false,
        note: "Wrung out from the bout — clear it after a long rest.",
        condition: "Exhaustion",
      },
    ],
    reward: {
      kind: "item",
      item: {
        name: "Confiscated Fighting Blade",
        item_type: "weapon",
        subtype: "shortsword",
        rarity: "mundane",
        requires_attunement: false,
        weight: 2,
        cost: "10 gp",
        description:
          "A nicked, well-used shortsword nobody claimed after the bout. It has seen more pits than you have.",
        tags: ["pit-fighting", "weapon"],
      },
    },
  },

  // ── Lie Low → notes (+ recovery) ────────────────────────────────────────────
  {
    id: "lie-low-recuperate",
    activityKey: "lie-low",
    weight: 3,
    title: "The heat dies down",
    vignette:
      "You do nothing worth writing home about, which is the whole point. A safe room, plain food, and time — and by the end of the interlude the people looking for you have run out of places to look.",
    proposedEffects: [
      {
        kind: "hp",
        applied: false,
        note: "A season of rest and mending.",
        delta: 15,
      },
    ],
    reward: {
      kind: "note",
      note: {
        title: "Lie low: the heat dies down",
        body: "You spent the interlude out of sight and let a bounty, a rumour, or a rival's attention cool off. Note what you were hiding from and whether it's truly gone — or just quieter.",
        category: "general",
        tags: ["lie-low", "downtime"],
      },
    },
  },
  {
    id: "lie-low-overheard",
    activityKey: "lie-low",
    weight: 2,
    title: "A quiet room hears everything",
    vignette:
      "Staying still and unnoticed, you catch what a louder person would have drowned out — a name, a date, a plan, murmured by people who never imagined anyone was listening.",
    proposedEffects: [],
    reward: {
      kind: "note",
      note: {
        title: "Lie low: something overheard",
        body: "While keeping your head down you overheard a rumour worth acting on. Write down what and who — the party now holds a lead earned by patience rather than force.",
        category: "general",
        tags: ["lie-low", "rumor", "hook"],
      },
    },
  },

  // ── Pull a Job → items (+ heat) ─────────────────────────────────────────────
  {
    id: "job-clean-score",
    activityKey: "pull-a-job",
    weight: 2,
    title: "In, out, and nobody the wiser",
    vignette:
      "It went the way jobs are supposed to go and almost never do: quietly. You were never there, the take is real, and the only trace is the space where something valuable used to be.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "The fenced value of the smaller pickings.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 50,
        pp: 0,
      },
    ],
    reward: {
      kind: "item",
      item: {
        name: "The Score",
        item_type: "art_object",
        subtype: null,
        rarity: "uncommon",
        requires_attunement: false,
        weight: 1,
        cost: "150 gp",
        description:
          "The prize of a clean job — a valuable object someone will eventually miss. Reskin it to whatever the party actually lifted.",
        tags: ["heist", "stolen", "valuable"],
      },
    },
  },
  {
    id: "job-botched",
    activityKey: "pull-a-job",
    weight: 1,
    title: "You got out. Mostly.",
    vignette:
      "The take is smaller than the plan promised and the description of your face is already making the rounds. You have something to show for it — and something following you because of it.",
    proposedEffects: [
      {
        kind: "gold",
        applied: false,
        note: "The little you managed to grab.",
        cp: 0,
        sp: 0,
        ep: 0,
        gp: 15,
        pp: 0,
      },
      {
        kind: "condition",
        applied: false,
        note: "Ran hard to shake the pursuit — winded and hunted.",
        condition: "Exhaustion",
      },
    ],
    reward: {
      kind: "item",
      item: {
        name: "Half-Botched Haul",
        item_type: "gear",
        subtype: null,
        rarity: "mundane",
        requires_attunement: false,
        weight: 2,
        cost: "20 gp",
        description:
          "A grab-bag of whatever you could carry before the whistles started. Worth a little coin — and evidence, if the wrong person recognises it.",
        tags: ["heist", "complication", "hook"],
      },
    },
  },
];

/** Seeds available to one archetype. Empty array means the deck has nothing. */
export function seedsForActivity(activityKey: string): DowntimeSeed[] {
  return DOWNTIME_SEEDS.filter((s) => s.activityKey === activityKey);
}
