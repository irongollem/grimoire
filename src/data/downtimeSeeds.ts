import type { DowntimeSeed } from "@/types/downtime.types";

/**
 * System seed content for The Interlude (#486).
 *
 * These are *templates*: a resolved draw clones one into the campaign as an
 * ordinary, private, fully-editable `npcs` row owned by the DM. Nothing
 * canonical is ever stored, so the `srd/` storage + `is_app_admin()` rules do
 * not apply. The moment we ship curated per-seed artwork, this must become an
 * `srd_*` table with the `srd/` storage policy in the same migration.
 *
 * A seed proposes a vignette and, sometimes, a cost. The DM decides how dark
 * their world is — nothing here is applied without an explicit tick on the
 * resolution board.
 */
export const DOWNTIME_SEEDS: DowntimeSeed[] = [
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
  {
    id: "carouse-disgraced-sage",
    activityKey: "carouse",
    weight: 2,
    title: "In vino, veritas",
    vignette:
      "The old man in the corner has been nursing the same cup for two hours. When you sit down, he tells you — unprompted, and in considerable detail — exactly why he was dismissed from the academy. Halfway through, you realise he is not raving.",
    proposedEffects: [],
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
  {
    id: "carouse-guild-recruiter",
    activityKey: "carouse",
    weight: 2,
    title: "We've been watching you",
    vignette:
      "She buys the round before you notice she is there, and by the time you do she already knows what you did last season and roughly what you were paid for it. The guild, she explains, pays better. The guild also asks more.",
    proposedEffects: [],
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
  {
    id: "carouse-flirtatious-noble",
    activityKey: "carouse",
    weight: 1,
    title: "Slumming it",
    vignette:
      "Nobody dressed like that drinks in a place like this by accident. They are bored, they are charming, and they are asking rather more questions about your work than idle curiosity would explain.",
    proposedEffects: [],
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
];

/** Seeds available to one archetype. Empty array means the deck has nothing. */
export function seedsForActivity(activityKey: string): DowntimeSeed[] {
  return DOWNTIME_SEEDS.filter((s) => s.activityKey === activityKey);
}
