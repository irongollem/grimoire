/**
 * "Steal this" posts: one monster, NPC or item from the Sugarwell demo, ready
 * to drop into any game, as a swipeable Instagram post. The cover slide is the
 * entry's own art with a hook line; the middle slides are a real Scriptorium
 * page (a one-chapter book in a book look) rendered by the app's own preview,
 * with the entry's live stat block embedded; the last slide says where it was
 * made. Everything here must stay true to the demo row it names.
 */

export interface StealPost {
  id: string;
  /** The demo row the handout embeds. */
  entity: { type: "monster" | "item" | "npc"; name: string };
  /** The page's look (`src/lib/scriptorium/looks.ts`): a book look, so it reads as a published supplement, not an in-game prop. */
  look: "onednd2024" | "phb2014";
  /** Fixed so re-running replaces the handout instead of adding another. */
  documentId: string;
  /** Over the art on the cover slide: what kind of thing it is, then the hook. */
  kicker: string;
  hook: string;
  /** The handout's chapter, as Tiptap JSON blocks (the embed is appended). */
  blocks: unknown[];
}

const text = (t: string, marks?: string[]) => ({ type: "text", text: t, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const h1 = (t: string) => ({ type: "heading", attrs: { level: 1 }, content: [text(t)] });
const readAloud = (t: string) => ({ type: "descriptiveBlock", content: [p(text(t))] });
const runIt = (t: string) => ({ type: "noteBlock", content: [p(text("Run it. ", ["bold"]), text(t))] });

export const STEAL_POSTS: StealPost[] = [
  {
    id: "steal-toffee-maw",
    entity: { type: "monster", name: "Toffee Maw" },
    look: "onednd2024",
    documentId: "5e7a1000-0000-4000-8000-000000000001",
    kicker: "Steal this monster",
    hook: "The candy bowl that bites back",
    blocks: [
      h1("The Toffee Maw"),
      p(text("A workshop fixture that isn't.", ["italic"])),
      readAloud("A glass-domed bowl of toffees sits on the workbench, every piece wrapped in gold foil. The dome is already lifted. One of the toffees is warm."),
      p(text("It waits as a candy bowl, a sweets display, a confectioner's centrepiece. A hand that reaches for a sweet reaches into a mouth: whoever touches it makes a DC 13 Strength save or sticks fast, and the Maw pulls them in.")),
      runIt("One per room at most, in a room the party only passes through. The surprise is the encounter. A passive Perception of 16 notices something wrong; a DC 16 Perception check confirms it."),
    ],
  },
  {
    id: "steal-memory-magpie",
    entity: { type: "monster", name: "Memory-Magpie" },
    look: "onednd2024",
    documentId: "5e7a1000-0000-4000-8000-000000000002",
    kicker: "Steal this creature",
    hook: "Thieves who give everything back. Eventually.",
    blocks: [
      h1("The Memory-Magpies"),
      p(text("They do not hoard. They curate.", ["italic"])),
      readAloud("A magpie watches you from the fork of an apple tree, one white feather among the blue-black. Under its foot, chest-high, sits the brass button you lost three days ago."),
      p(text("Whatever a magpie takes turns up three afternoons later in the fork of a tree, in the path of whoever it has decided should find it next. They do not steal for profit. They steal because they have an opinion about where things belong.")),
      runIt("Offer one something shiny that no other magpie has seen, and it trades. Leave a token at a nest on purpose, and it turns up in a character's pack next session."),
    ],
  },
];
