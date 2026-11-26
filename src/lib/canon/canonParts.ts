import { KNOWLEDGE_MARKS, type CanonEntry, type CanonPart, type KnowledgeMark } from "@/types/canon.types";

/**
 * The chapters of the Canon, the campaign's background book, in the order the contents list them and grouped as the
 * book is: front matter, the world, the story (the DM's only), the characters. Each chapter is the only place the
 * contents column, the route and the search learn of a part.
 */
export const CANON_GROUPS = [
  { id: "front", label: "Front matter" },
  { id: "world", label: "The world" },
  { id: "story", label: "The story, yours only" },
  { id: "characters", label: "The characters" },
] as const;

export const CANON_SECTIONS = [
  { id: "premise", label: "Premise and tone", short: "Premise", group: "front", parts: ["premise"], counted: true, why: "What the campaign is, how it plays, and what is off the table. Every suggestion is written from it." },
  // The world's own clock, calendar and coins are campaign columns, not entries: no part, so no count.
  { id: "world", label: "How the world works", short: "World", group: "front", parts: [], counted: false, why: "The calendar, the climate and the coins a reader needs." },
  { id: "truths", label: "Truths", short: "Truths", group: "world", parts: ["truth"], counted: true, why: "What is simply so about your world, and who knows it." },
  { id: "lore", label: "Lore", short: "Lore", group: "world", parts: ["lore"], counted: true, why: "History, legends, faiths and ways, told in passages." },
  // The peoples (campaign_peoples) and the habitats are not canon entries; a truth that belongs to a habitat is still a
  // truth and counted under Truths.
  // The timeline is a read of dated lore, forces, calendar events and sessions, plus the events a DM adds there (dated lore): no part of its own.
  { id: "timeline", label: "Timeline", short: "Timeline", group: "world", parts: [], counted: false, why: "What happened and what is due, in the world's own calendar, with the events you add." },
  { id: "peoples", label: "Peoples", short: "Peoples", group: "world", parts: [], counted: false, why: "The world's peoples and cultures: where they live and how." },
  { id: "life", label: "Habitats", short: "Habitats", group: "world", parts: [], counted: false, why: "Creatures and habitats: what lives where, and what the land gives." },
  { id: "species", label: "Field guide", short: "Field guide", group: "world", parts: [], counted: false, why: "The world's living things: each species, its kin, its forms, and what it does to the others." },
  // Arcs are their own table, not entries: the contents' count comes from `sectionCounts`'s `arcCount`.
  { id: "arcs", label: "Arcs", short: "Arcs", group: "story", parts: [], counted: true, why: "The campaign's acts: what each asks, what is at stake, and how it ends." },
  { id: "moving", label: "Forces", short: "Forces", group: "story", parts: ["force"], counted: true, why: "Forces that act whether or not the party does. Never shown to players." },
  // Questions are counted with the secrets: the contents column shows one number for the whole chapter.
  { id: "secrets", label: "Secrets and questions", short: "Secrets", group: "story", parts: ["secret", "question"], counted: true, why: "What the world keeps back, and what you leave open on purpose." },
  // A backstory is one per character: the page counts the characters, not the entries opened so far.
  { id: "backstories", label: "Backstories", short: "Backstories", group: "characters", parts: ["backstory"], counted: true, why: "Each character's past, told in passages." },
] as const;

export type CanonSectionId = (typeof CANON_SECTIONS)[number]["id"];

/** The route's `:part` pattern: only a part's id, so `/canon/tonight` and `/canon/import` are never read as one (`/canon/arcs/:id` redirects to `/canon/arcs?arc=<id>`). */
export const CANON_PART_PATTERN = CANON_SECTIONS.map((s) => s.id).join("|");

/** The parts an arc narrows (the premise, the backstories and the rest of the page belong to no arc): the arc bar shows above them. */
export const ARC_NARROWED_SECTIONS: readonly CanonSectionId[] = ["truths", "moving", "secrets", "lore"];

export function chapterOf(id: CanonSectionId): (typeof CANON_SECTIONS)[number] {
  const chapter = CANON_SECTIONS.find((s) => s.id === id);
  if (!chapter) throw new Error(`No canon chapter "${id}"`);
  return chapter;
}

export function isSectionId(value: unknown): value is CanonSectionId {
  return CANON_SECTIONS.some((s) => s.id === value);
}

/** The suggestion helpers name a part by their own word ("forces", "questions"); a link made with one lands on the part that holds it. */
// The table's lines arrive on Truths now; the Chronicle is not a chapter of this page.
const SECTION_OF_WORD: Record<string, CanonSectionId> = { forces: "moving", questions: "secrets", table: "truths" };

/** The part `?section=<word>` names: a part's id, or the word a helper uses for one. Null for anything else. */
export function sectionFromWord(word: unknown): CanonSectionId | null {
  if (isSectionId(word)) return word;
  return typeof word === "string" ? (SECTION_OF_WORD[word] ?? null) : null;
}

/** The page section an entry of this part sits in: where a link to one entry (`?entry=<id>`) lands. */
export function sectionOfPart(part: CanonPart): CanonSectionId {
  const section = CANON_SECTIONS.find((s) => (s.parts as readonly string[]).includes(part));
  if (!section) throw new Error(`No canon section holds the part "${part}"`);
  return section.id;
}

/**
 * How many entries each part holds, for the contents column. An entry that has ended (an answered
 * question, a force no longer moving) is not counted: the number says what is still open or moving. One rule, here.
 * The arcs are not entries, so their chapter's number is the `arcCount` the caller reads from `useCanonArcs`.
 */
export function sectionCounts(entries: readonly CanonEntry[], arcCount = 0): Record<CanonSectionId, number> {
  const counts = {} as Record<CanonSectionId, number>;
  for (const section of CANON_SECTIONS) counts[section.id] = entries.filter((e) => e.closed_as === null && (section.parts as readonly string[]).includes(e.part)).length;
  counts.arcs = arcCount;
  return counts;
}

export const KNOWLEDGE_LABEL: Record<KnowledgeMark, string> = {
  all: "Known to all",
  some: "Known to some",
  // The mark, not the Secrets chapter: a truth nobody in the world says. A secret to be found and revealed is made in Secrets.
  secret: "Known to no one",
};

/** The three marks as a segmented control's options, in the table's order. */
export const MARK_OPTIONS: ReadonlyArray<{ value: KnowledgeMark; label: string }> = KNOWLEDGE_MARKS.map((value) => ({
  value,
  label: KNOWLEDGE_LABEL[value],
}));

export const KNOWLEDGE_HELP =
  "Known to all: anyone in the world may say it, and players read it. Known to some: only the people below know it. Known to no one: nobody in the world says it.";

/**
 * Plain text as a Tiptap document (a paragraph per blank-line block, a line break per newline), for a pitch started
 * from a named world's default text. Never empty: an editor opened on `{"type":"doc","content":[]}` is not a document.
 */
export function plainTextToTiptap(text: string): string {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "");
  const paragraphs = blocks.map((block) => {
    const content: object[] = [];
    block.split("\n").forEach((line, index) => {
      if (index > 0) content.push({ type: "hardBreak" });
      if (line.trim() !== "") content.push({ type: "text", text: line });
    });
    return { type: "paragraph", content };
  });
  return JSON.stringify({ type: "doc", content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }] });
}

/** The named worlds the World field offers, as the Details tab's did before the field moved here. */
export const WORLD_NAMES = [
  "Forgotten Realms",
  "Eberron",
  "Ravenloft",
  "Dragonlance",
  "Greyhawk",
  "Planescape",
  "Spelljammer",
  "Dark Sun",
  "Mystara",
  "Homebrew",
] as const;
