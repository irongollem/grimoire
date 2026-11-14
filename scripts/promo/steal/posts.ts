/**
 * "Steal this" posts: one monster, NPC or item from the Sugarwell demo, ready
 * to drop into any game, as a swipeable Instagram post. The cover slide is the
 * entry's own art with a hook line; the middle slides are a real Scriptorium
 * page (a one-chapter book in a book look) rendered by the app's own preview,
 * with the entry's live stat block embedded; the last slide says where it was
 * made. Everything here must stay true to the row it names: a row of the
 * Sugarwell demo copy, or of "Late in the Kind Country", the full campaign the
 * demo comes from (put on the DM fixture by `npm run dev:campaigns`), whose
 * creatures carry the setting book's own lore, art and 2024 stat blocks.
 */
import { quote, sql } from "../../lib/dev-db.ts";
import { FIXTURE_EMAIL } from "../../lib/dev-campaign-io.ts";
import { demoCampaignId, localDb } from "../setup/demo";

export interface StealPost {
  id: string;
  /** Where the row lives on the DM fixture: the demo copy unless named. */
  campaign?: "kind-country";
  /** The demo row the handout embeds. */
  entity: { type: "monster" | "item" | "npc"; name: string };
  /** The page's look (`src/scriptorium/lib/looks.ts`): a book look, so it reads as a published supplement, not an in-game prop. */
  look: "onednd2024" | "phb2014";
  /** Fixed so re-running replaces the handout instead of adding another. */
  documentId: string;
  /** Over the art on the cover slide: what kind of thing it is, then the hook. */
  kicker: string;
  hook: string;
  /** The teaser Reel's sound: a CC0 loop from the soundboard library (`sound_library.slug`), so it needs no credit. */
  ambience: string;
  /** The handout's chapter, as Tiptap JSON blocks (the embed is appended). */
  blocks: unknown[];
}

const KIND_COUNTRY = "Late in the Kind Country";

/** The local campaign a post's row is read from. */
export function campaignIdFor(post: StealPost): string {
  if (post.campaign !== "kind-country") return demoCampaignId();
  const id = sql(
    localDb(),
    `select c.id from public.campaigns c join auth.users u on u.id = c.user_id
      where c.name = ${quote(KIND_COUNTRY)} and u.email = ${quote(FIXTURE_EMAIL)} limit 1`,
  );
  if (!id) throw new Error(`${post.id}: the DM fixture has no "${KIND_COUNTRY}". Run \`npm run dev:campaigns\`.`);
  return id;
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
    ambience: "fire/fireplace-loop",
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
    ambience: "forest/birds-ambient",
    blocks: [
      h1("The Memory-Magpies"),
      p(text("They do not hoard. They curate.", ["italic"])),
      readAloud("A magpie watches you from the fork of an apple tree, one white feather among the blue-black. Under its foot, chest-high, sits the brass button you lost three days ago."),
      p(text("Whatever a magpie takes turns up three afternoons later in the fork of a tree, in the path of whoever it has decided should find it next. They do not steal for profit. They steal because they have an opinion about where things belong.")),
      runIt("Offer one something shiny that no other magpie has seen, and it trades. Leave a token at a nest on purpose, and it turns up in a character's pack next session."),
    ],
  },
  {
    id: "steal-snuffer",
    campaign: "kind-country",
    entity: { type: "monster", name: "Snuffer" },
    look: "onednd2024",
    documentId: "5e7a1000-0000-4000-8000-000000000006",
    kicker: "Steal this monster",
    hook: "It puts out every lamp left burning",
    ambience: "night/cicadas-bed",
    blocks: [
      h1("The Snuffer"),
      p(text("The road's night-watch, and it is very polite.", ["italic"])),
      readAloud("Long after the last lamp was lit, something tall comes down the road on legs like lamp-poles: black soot and brass, a snuffer-cone for a head. At each post it reaches up with fingers like tongs, and the light goes out with a small sound like a held breath."),
      p(text("Every unattended flame within 30 feet of it goes out, turn after turn. It will not take a flame someone is holding, and a flame given to it freely it carries away unharmed until dawn, attacking no one. Cornered, it swings its cone from 10 feet away and breathes a cold that puts out whatever light the party carries.")),
      runIt("Let it come down the road while the party camps. The torches and the campfire go out one by one, and nobody has drawn a weapon yet. A player who holds out a lit candle ends the encounter. A party that fights it ends up fighting in the dark."),
    ],
  },
  {
    id: "steal-sinkmouth",
    campaign: "kind-country",
    entity: { type: "monster", name: "Sinkmouth" },
    look: "onednd2024",
    documentId: "5e7a1000-0000-4000-8000-000000000007",
    kicker: "Steal this monster",
    hook: "The friendliest hole in the road",
    ambience: "town/church-bells-birds",
    blocks: [
      h1("The Sinkmouth"),
      p(text("It only wants a taste of whatever you have.", ["italic"])),
      readAloud("You smell it before you see it: vanilla and warm bread, from thirty yards off. At the roadside sits a round hole lined with soft pink fondant and ringed with peppermint teeth. Someone has laid a plank across it, and left a spoon beside it."),
      p(text("It sits by the road like a very polite pothole, and the ground around it is sticky enough to slow anyone down. It will take whatever is in your hand if it is sweet, and your hand if it has been sweet recently: a bite that grabs and holds, a tongue that draws you in, and sugar that softens whoever it holds.")),
      runIt("Put the plank and the spoon in the description and let the party wonder why. Anyone who feeds it something sweet is safe from it, with their friends, for a full day. The locals feed it a spoon of syrup every dawn."),
    ],
  },
  {
    id: "steal-blinkhill",
    campaign: "kind-country",
    entity: { type: "monster", name: "Blinkhill" },
    look: "onednd2024",
    documentId: "5e7a1000-0000-4000-8000-000000000008",
    kicker: "Steal this monster",
    hook: "The hill you stopped on for lunch",
    ambience: "wind/park-wind",
    blocks: [
      h1("The Blinkhill"),
      p(text("A good place to eat lunch, until the afternoon it opens an eye.", ["italic"])),
      readAloud("The hill is round and green-gold and the view from the top is lovely. Then the turf near the crest folds back, and an eye the size of a cottage door, the colour of old gold, looks at you."),
      p(text("It does not hunt. It is asleep, and its one wakeful eye blinks once an hour; while it is closed, the hillside changes. A shadow moves, a path reroutes, a cairn appears that nobody built. Hurt it, or let anyone near it hurt anyone else, and it wakes: a gargantuan hill with turf fists and a slow blink that leaves whoever sees it stunned while the ground rearranges around them.")),
      runIt("Let the party picnic on it first. If a quarrel at camp turns into a fight, the hill wakes. A song or a story, sung to it well enough, closes its eye for the night."),
    ],
  },
  {
    id: "steal-hand-from-the-closet",
    campaign: "kind-country",
    entity: { type: "monster", name: "The Hand from the Closet" },
    look: "onednd2024",
    documentId: "5e7a1000-0000-4000-8000-000000000009",
    kicker: "Steal this monster",
    hook: "Close the door. Quickly.",
    ambience: "dungeon/dungeon-ambience-loop",
    blocks: [
      h1("The Hand from the Closet"),
      p(text("You never see what it is attached to.", ["italic"])),
      readAloud("In the middle of the wilderness stands a wardrobe door, open a crack onto blackness. As you watch, a hand comes out of it: pale, enormous, on an arm far too long, its fingers spread."),
      p(text("A nightmare given enough shape to fight. It cannot leave its door, but it reaches 15 feet, grabs twice a turn, and drags whoever it holds toward the dark. Anyone pulled through the door hurts in the mind, not the body. Close the door, which takes a strong arm, and it cannot attack until someone opens it again.")),
      runIt("Put the weight on dread, not damage: the party should be afraid while they fight, not after. Describe the door first and the hand later. The fight ends the moment someone thinks to shut the door."),
    ],
  },
];
