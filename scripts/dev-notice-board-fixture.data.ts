/**
 * The written content of the notice-board dev fixture (#1064), kept apart from
 * the script so its pure parts can be tested without a database.
 *
 * Positions are fractions of the 3:2 board, measured to a pin's top-left
 * corner. A pin's footprint in the same units is `PIN_WIDTH[size]` wide and,
 * because the board is 1600 x 1067 at reference size, roughly `width * 1.5`
 * (height fraction = width px / 1067 px) tall for a square-ish note; a poster
 * is 3:4. `pinFootprint` states that once so the test can hold the layout to it.
 */

export type PinStyle = "note" | "poster" | "letter" | "image";
export type PinSize = "sm" | "md" | "lg";
export type PinStatus = "draft" | "up" | "taken";

export interface FixturePin {
  style: PinStyle;
  size: PinSize;
  headline: string;
  body: string;
  reward?: string;
  seal?: "red" | "black";
  x: number;
  y: number;
  status: PinStatus;
  /** Index into buildFixtureQuests(): the pin links that quest and its handout. */
  questIndex?: number;
}

export interface FixtureQuest {
  title: string;
  summary: string;
  handoutTitle: string;
  /** Paragraphs of the handout, in order. */
  handout: string[];
}

/** Marks the quests and handouts this script made; `clear` finds them by it. */
export const FIXTURE_TAG = "dev-notice-board-fixture";

export const FALLBACK_BOARD_NAME = "The Village Notice Board";
export const FALLBACK_BOUNTY_TARGET = "Grell Ashmantle";

/**
 * The two quests and their handouts. The first is the bounty on the poster's
 * subject, so the quest, the writ and the poster all name the same person:
 * `subject` is the chosen NPC's name, or FALLBACK_BOUNTY_TARGET. The original
 * title only fits the fallback; any other subject gets "The Bounty on {name}".
 */
export function buildFixtureQuests(subject: string): readonly FixtureQuest[] {
  return [
    {
      title: subject === FALLBACK_BOUNTY_TARGET ? "The Ratcatcher's Bounty" : `The Bounty on ${subject}`,
      summary: `${subject} burned a barn and stole three hens. The reeve pays fifty crowns for them.`,
      handoutTitle: "Writ of Bounty",
      handout: [
        `By the hand of the reeve of this parish: ${subject} stands accused of burning the miller's barn and of stealing three prize hens.`,
        `Fifty gold crowns will be paid to whoever brings ${subject} before the reeve, alive and able to answer the charge.`,
        "Collect the reward at the reeve's hall. Ask for the clerk, and bring this writ.",
      ],
    },
    {
      title: "Lights on the Old Lighthouse",
      summary: "The lighthouse at the end of the spit has burned green for three nights and the keeper is silent.",
      handoutTitle: "A Plea from the Lighthouse",
      handout: [
        "To whoever reads this,",
        "I do not know who else to ask. The light has burned green for three nights now, and I did not light it so. I have heard the stairs creak when no one climbs them.",
        "If you have courage and a lantern, come to the lighthouse at the end of the spit. Knock three times, and wait. I will open the door if I can.",
        "The keeper",
      ],
    },
  ];
}

export const FIXTURE_PINS: readonly FixturePin[] = [
  {
    style: "poster",
    size: "lg",
    headline: FALLBACK_BOUNTY_TARGET,
    body: "Wanted for the burning of the miller's barn and the theft of three prize hens. Last seen on the old quarry road.",
    reward: "50 gold crowns, paid at the reeve's hall",
    x: 0.04,
    y: 0.08,
    status: "up",
    questIndex: 0,
  },
  {
    style: "note",
    size: "md",
    headline: "Help wanted",
    body: "Strong backs needed at the Wendle mill before the rains. Sacks to haul, a silver a day and supper. Ask for Old Maddy.",
    x: 0.33,
    y: 0.06,
    status: "up",
  },
  {
    style: "note",
    size: "sm",
    headline: "LOST: one goat",
    body: "Answers to Gerald. Brown, one horn, eats anything, letters included. A fresh pie to whoever brings him home. Mrs. Tibbett, the cottage with the blue door.",
    x: 0.56,
    y: 0.08,
    status: "up",
  },
  {
    style: "letter",
    size: "md",
    headline: "To the brave souls who read this",
    body: "If you have courage and a lantern, come to the lighthouse at the end of the spit. The light has been burning green for three nights, and the keeper does not answer.",
    seal: "red",
    x: 0.73,
    y: 0.06,
    status: "up",
    questIndex: 1,
  },
  {
    style: "note",
    size: "md",
    headline: "Town notice",
    body: "By order of the reeve: no fires in the square after dark. The watch will collect a fine of two copper from anyone found doing so.",
    x: 0.33,
    y: 0.45,
    status: "up",
  },
  {
    style: "image",
    size: "md",
    headline: "Have you seen this?",
    body: "Lost from the chapel. No questions asked.",
    x: 0.57,
    y: 0.42,
    status: "up",
  },
  {
    style: "note",
    size: "sm",
    headline: "Rats in the cellar",
    body: "The Gilded Ewe needs a ratcatcher. Bring your own terrier.",
    x: 0.05,
    y: 0.7,
    status: "taken",
  },
  {
    style: "note",
    size: "md",
    headline: "Masked ball",
    body: "A private invitation, not for the board yet.",
    x: 0.78,
    y: 0.55,
    status: "draft",
  },
];

/** Session number the "taken" pin claims to have been taken in. */
export const TAKEN_SESSION_NUMBER = 3;
export const TAKEN_DAYS_AGO = 4;

const PIN_WIDTH: Record<PinSize, number> = { sm: 220 / 1600, md: 300 / 1600, lg: 400 / 1600 };
/** Board height as a fraction of its width (3:2). */
const BOARD_ASPECT = 2 / 3;

/** A pin's rectangle in board fractions: posters are 3:4, everything else square-ish. */
export function pinFootprint(pin: Pick<FixturePin, "style" | "size" | "x" | "y">): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const w = PIN_WIDTH[pin.size];
  const heightOverWidth = pin.style === "poster" ? 4 / 3 : 1.1;
  const h = (w * heightOverWidth) / BOARD_ASPECT;
  return { x0: pin.x, y0: pin.y, x1: pin.x + w, y1: pin.y + h };
}

/** Pairs of pin indexes whose footprints overlap, or run off the board. */
export function layoutProblems(pins: readonly FixturePin[]): string[] {
  const problems: string[] = [];
  const boxes = pins.map(pinFootprint);
  boxes.forEach((b, i) => {
    if (b.x1 > 1 || b.y1 > 1) problems.push(`pin ${i} runs off the board`);
    for (let j = i + 1; j < boxes.length; j++) {
      const o = boxes[j];
      if (o && b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1) {
        problems.push(`pins ${i} and ${j} overlap`);
      }
    }
  });
  return problems;
}

/**
 * The place the board hangs at: the most tavern-like name, a tavern or inn
 * before a square, hall or market, else the campaign's first place, else null.
 */
export function pickBoardPlace<T extends { name: string }>(places: readonly T[]): T | null {
  const tiers = [/\binn\b|tavern|flagon/i, /square|hall|market/i];
  for (const tier of tiers) {
    const hit = places.find((p) => tier.test(p.name));
    if (hit) return hit;
  }
  return places[0] ?? null;
}

export function boardNameFor(place: { name: string } | null): string {
  return place ? `The Notice Board at ${place.name}` : FALLBACK_BOARD_NAME;
}

/** A short TipTap document: one paragraph per string. */
export function tiptapDoc(paragraphs: readonly string[]): { type: "doc"; content: unknown[] } {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  };
}
