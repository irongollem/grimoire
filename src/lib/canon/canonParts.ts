import { KNOWLEDGE_MARKS, type CanonEntry, type CanonPart, type KnowledgeMark } from "@/types/canon.types";

/**
 * The parts of the Canon page, in the order the contents column lists them. Story 2 draws Premise and tone and
 * Truths; each later story adds its own part here, which is the only place the contents column learns of it.
 */
export const CANON_SECTIONS = [
  { id: "premise", numeral: "I", label: "Premise and tone", short: "Premise", parts: ["premise"], counted: true },
  { id: "truths", numeral: "II", label: "Truths", short: "Truths", parts: ["truth"], counted: true },
  { id: "moving", numeral: "III", label: "What is moving", short: "Moving", parts: ["force"], counted: true },
  // Questions are counted with the secrets: the contents column shows one number for the whole part.
  { id: "secrets", numeral: "IV", label: "Secrets and questions", short: "Secrets", parts: ["secret", "question"], counted: true },
  // The world's own clock, calendar and coins are campaign columns, not entries: no part, so no count.
  { id: "world", numeral: "V", label: "How the world works", short: "World", parts: [], counted: false },
  // Who and what lives in it: the peoples (campaign_peoples) and the habitats, none of them canon entries; a truth that
  // belongs to a habitat is still a truth and counted under Truths.
  { id: "life", numeral: "VI", label: "Who and what lives here", short: "Life", parts: [], counted: false },
  { id: "lore", numeral: "VII", label: "Lore", short: "Lore", parts: ["lore"], counted: true },
  // A backstory is one per character (frame 14): the page counts the characters, not the entries opened so far.
  { id: "backstories", numeral: "VIII", label: "Backstories", short: "Backstories", parts: ["backstory"], counted: true },
  // The Chronicle is the sessions' notes, not canon entries: no part, and its count (the sessions with a chronicle
  // entry written) is added by the page. What the table added is the Narrator's, set apart below a rule (frame 03).
  { id: "chronicle", numeral: "IX", label: "Chronicle", short: "Chronicle", parts: [], counted: true },
  { id: "table", numeral: "✦", label: "What the table added", short: "Table", parts: [], counted: true },
] as const;

/** The part set apart in the contents column, below a rule and with its own hint. */
export const TABLE_SECTION_HINT = "Filled by the Narrator as it invents. Keep, edit or strike each line.";

export type CanonSectionId = (typeof CANON_SECTIONS)[number]["id"];

/** The route's `:part` pattern: only a part's id, so `/canon/tonight`, `/canon/arcs/:id` and `/canon/import` are never read as one. */
export const CANON_PART_PATTERN = CANON_SECTIONS.map((s) => s.id).join("|");

/** The parts an arc narrows (the premise, the backstories and the rest of the page belong to no arc): the arc bar shows above them. */
export const ARC_NARROWED_SECTIONS: readonly CanonSectionId[] = ["truths", "moving", "secrets", "lore"];

export function isSectionId(value: unknown): value is CanonSectionId {
  return CANON_SECTIONS.some((s) => s.id === value);
}

/** The suggestion helpers name a part by their own word ("forces", "questions"); a link made with one lands on the part that holds it. */
const SECTION_OF_WORD: Record<string, CanonSectionId> = { forces: "moving", questions: "secrets" };

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
 * How many entries each part holds, for the contents column and the start strip. An entry that has ended (an answered
 * question, a force no longer moving) is not counted: the number says what is still open or moving, and the strip's
 * "Name who is moving" is not done by a force that has already stopped. One rule, here, for both readers.
 */
export function sectionCounts(entries: readonly CanonEntry[]): Record<CanonSectionId, number> {
  const counts = {} as Record<CanonSectionId, number>;
  for (const section of CANON_SECTIONS) counts[section.id] = entries.filter((e) => e.closed_as === null && (section.parts as readonly string[]).includes(e.part)).length;
  return counts;
}

export interface StartStep {
  part: CanonSectionId;
  label: string;
  done: boolean;
}

/**
 * The four first things a new campaign's canon wants, in order, each marked done once its part holds something. The
 * pitch is judged by `hasPitch` (the premise part also holds themes and tone, which do not count as a pitch).
 */
export function startSteps(counts: Record<CanonSectionId, number>, hasPitch: boolean): StartStep[] {
  return [
    { part: "premise", label: "Write the pitch", done: hasPitch },
    { part: "truths", label: "Say what is true", done: counts.truths > 0 },
    { part: "moving", label: "Name who is moving", done: counts.moving > 0 },
    { part: "secrets", label: "Keep a secret, with three clues", done: counts.secrets > 0 },
  ];
}

export const KNOWLEDGE_LABEL: Record<KnowledgeMark, string> = {
  all: "Known to all",
  some: "Known to some",
  secret: "Secret",
};

/** The three marks as a segmented control's options, in the table's order. */
export const MARK_OPTIONS: ReadonlyArray<{ value: KnowledgeMark; label: string }> = KNOWLEDGE_MARKS.map((value) => ({
  value,
  label: KNOWLEDGE_LABEL[value],
}));

export const KNOWLEDGE_HELP =
  "Known to all: anyone in the world may say it, and players read it. Known to some: only the people below know it. Secret: nobody in the world says it.";

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
