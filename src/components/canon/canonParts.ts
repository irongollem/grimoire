import { KNOWLEDGE_MARKS, type CanonEntry, type KnowledgeMark } from "@/types/canon.types";

/**
 * The parts of the Canon page, in the order the contents column lists them. Story 2 draws Premise and tone and
 * Truths; each later story adds its own part here, which is the only place the contents column learns of it.
 */
export const CANON_SECTIONS = [
  { id: "premise", numeral: "I", label: "Premise and tone", short: "Premise", part: "premise" },
  { id: "truths", numeral: "II", label: "Truths", short: "Truths", part: "truth" },
] as const;

export type CanonSectionId = (typeof CANON_SECTIONS)[number]["id"];

export function isCanonSectionId(value: string): value is CanonSectionId {
  return CANON_SECTIONS.some((s) => s.id === value);
}

/** How many entries each part holds, for the contents column. */
export function sectionCounts(entries: readonly CanonEntry[]): Record<CanonSectionId, number> {
  const counts = {} as Record<CanonSectionId, number>;
  for (const section of CANON_SECTIONS) counts[section.id] = entries.filter((e) => e.part === section.part).length;
  return counts;
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
