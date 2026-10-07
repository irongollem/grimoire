/**
 * Splitting a page's body into the columns of the record it becomes.
 * Pure: the review screen shows the result, the sweep writes it.
 */
import { QUEST_SUMMARY_MAX, splitQuestSummary } from "@/lib/quests/summary";
import { frontmatterString } from "./frontmatter";
import type { ArchivePage, ArchivePageKind, TiptapDoc, TiptapNode } from "./types";

/** Headings (case-insensitive) that start a section belonging to an NPC column. Extend, don't branch. */
export const NPC_SECTION_HINTS: Readonly<Record<"appearance" | "personality" | "backstory" | "notes", readonly string[]>> = {
  appearance: ["appearance", "physical description", "description", "looks"],
  personality: ["personality", "personality traits", "mannerisms", "demeanor", "demeanour"],
  backstory: ["backstory", "background", "history", "biography"],
  notes: ["dm notes", "gm notes", "notes", "secrets"],
};

/** Headings that carry a quest's one-line premise. */
export const QUEST_SUMMARY_HEADINGS: readonly string[] = ["summary", "premise", "overview", "hook"];

export interface NpcFields {
  kind: "npc";
  appearance?: TiptapDoc;
  personality?: TiptapDoc;
  /** Also receives everything not under a recognised heading. */
  backstory?: TiptapDoc;
  notes?: TiptapDoc;
}
export interface DescriptionFields {
  kind: "location" | "faction" | "item";
  description?: TiptapDoc;
}
export interface QuestFields {
  kind: "quest";
  /**
   * PLAIN one-line text, at most `QUEST_SUMMARY_MAX` characters, no newline:
   * `quests.summary` is a text column (an `AppInput`, shown verbatim to
   * players), not rich text. Null when the page offers no sentence short
   * enough; the DM writes one.
   */
  summary: string | null;
  /** Prose that does not fit the one-liner, for the opening beat's `dm_content` (rich text). */
  beatContent?: TiptapDoc;
}
export interface NoteFields {
  kind: "note";
  title: string;
  content?: TiptapDoc;
  category: string | null;
  tags: string[];
}
export type ArchiveFields = NpcFields | DescriptionFields | QuestFields | NoteFields;

// ── helpers ─────────────────────────────────────────────────────────────

function nodeText(node: TiptapNode): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "archiveLink" && typeof node.attrs === "object" && node.attrs) {
    const label = (node.attrs as { label?: unknown }).label;
    return typeof label === "string" ? label : "";
  }
  if (Array.isArray(node.content)) return (node.content as TiptapNode[]).map(nodeText).join(node.type === "doc" ? "\n" : "");
  return "";
}

function headingLevel(node: TiptapNode): number | null {
  if (node.type !== "heading") return null;
  const level = (node.attrs as { level?: unknown } | undefined)?.level;
  return typeof level === "number" ? level : 1;
}

function isBlank(node: TiptapNode): boolean {
  return node.type === "paragraph" && !node.content;
}

/** A document from `nodes` without leading/trailing empty paragraphs, or undefined when nothing is left. */
function docOf(nodes: TiptapNode[]): TiptapDoc | undefined {
  let start = 0;
  let end = nodes.length;
  while (start < end && isBlank(nodes[start])) start++;
  while (end > start && isBlank(nodes[end - 1])) end--;
  return end > start ? { type: "doc", content: nodes.slice(start, end) } : undefined;
}

interface Section {
  /** Heading node, or null for the text before the first heading. */
  heading: TiptapNode | null;
  name: string;
  level: number;
  nodes: TiptapNode[];
}

/**
 * Sections are cut at headings whose name is in `known`, at any level, and at
 * any heading that is not deeper than the section it falls in. A deeper one
 * ("### Family" under "## Backstory") stays inside it and keeps its structure.
 */
function sectionsOf(body: TiptapDoc, known: ReadonlySet<string>): Section[] {
  const sections: Section[] = [{ heading: null, name: "", level: 0, nodes: [] }];
  for (const node of body.content) {
    const level = headingLevel(node);
    const name = level === null ? "" : nodeText(node).trim().toLowerCase();
    const current = sections[sections.length - 1];
    // An unrecognised heading at or above the open section's own level ends it too, and becomes a section of its own.
    const opens = level !== null && (known.has(name) || (current.heading !== null && level <= current.level));
    if (opens) sections.push({ heading: node, name, level, nodes: [] });
    else current.nodes.push(node);
  }
  return sections;
}

function knownNames(table: Readonly<Record<string, readonly string[]>>): Set<string> {
  return new Set(Object.values(table).flat());
}

// ── per kind ────────────────────────────────────────────────────────────

function npcFields(page: ArchivePage): NpcFields {
  const columns: Record<"appearance" | "personality" | "backstory" | "notes", TiptapNode[]> = {
    appearance: [],
    personality: [],
    backstory: [],
    notes: [],
  };
  const columnFor = (name: string): keyof typeof columns | null => {
    for (const [column, names] of Object.entries(NPC_SECTION_HINTS) as [keyof typeof columns, readonly string[]][]) {
      if (names.includes(name)) return column;
    }
    return null;
  };
  for (const section of sectionsOf(page.body, knownNames(NPC_SECTION_HINTS))) {
    const column = section.heading ? columnFor(section.name) : null;
    // A recognised heading is the column's label, so it is dropped. Text before any heading, and sections nobody asked for (with their heading), land in backstory.
    if (column) columns[column].push(...section.nodes);
    else columns.backstory.push(...(section.heading ? [section.heading, ...section.nodes] : section.nodes));
  }
  const out: NpcFields = { kind: "npc" };
  for (const column of Object.keys(columns) as (keyof typeof columns)[]) {
    const doc = docOf(columns[column]);
    if (doc) out[column] = doc;
  }
  return out;
}

/** Drops a leading `## Description` (what our own export writes around a description). */
function withoutLeadingHeading(body: TiptapDoc, names: readonly string[]): TiptapNode[] {
  const [head, ...rest] = body.content;
  if (head && headingLevel(head) !== null && names.includes(nodeText(head).trim().toLowerCase())) return rest;
  return body.content;
}

function descriptionFields(page: ArchivePage, kind: DescriptionFields["kind"]): DescriptionFields {
  const doc = docOf(withoutLeadingHeading(page.body, ["description"]));
  return doc ? { kind, description: doc } : { kind };
}

function questFields(page: ArchivePage): QuestFields {
  const sections = sectionsOf(page.body, new Set(QUEST_SUMMARY_HEADINGS));
  const premise = sections.find((s) => s.heading && QUEST_SUMMARY_HEADINGS.includes(s.name));
  let source: string;
  let leftover: TiptapNode[];
  if (premise) {
    source = premise.nodes.map(nodeText).join(" ").replace(/\s+/g, " ").trim();
    leftover = sections.filter((s) => s !== premise).flatMap((s) => (s.heading ? [s.heading, ...s.nodes] : s.nodes));
  } else {
    const firstParagraph = page.body.content.find((n) => n.type === "paragraph");
    source = firstParagraph ? nodeText(firstParagraph).replace(/\s+/g, " ").trim() : "";
    leftover = page.body.content;
  }
  const { head, tail } = splitQuestSummary(source);
  // A premise longer than one sentence keeps its tail: it is prose and belongs on the beat.
  const tailNodes: TiptapNode[] = tail && premise ? [{ type: "paragraph", content: [{ type: "text", text: tail }] }] : [];
  // splitQuestSummary refuses a over-long head (null head, whole text as tail), so the cap always holds.
  const summary = head && head.length <= QUEST_SUMMARY_MAX ? head : null;
  const doc = docOf([...tailNodes, ...leftover]);
  return doc ? { kind: "quest", summary, beatContent: doc } : { kind: "quest", summary };
}

function noteFields(page: ArchivePage): NoteFields {
  const doc = docOf(page.body.content);
  const category = frontmatterString(page.frontmatter.category);
  const base: NoteFields = { kind: "note", title: page.title, category, tags: page.tags };
  return doc ? { ...base, content: doc } : base;
}

/**
 * The record columns for `page` read as `kind`. `kind` is the DM's settled
 * choice, not necessarily `page.kind`. A `skip` page has no fields.
 */
export function fieldsForKind(page: ArchivePage, kind: Exclude<ArchivePageKind, "skip">): ArchiveFields {
  switch (kind) {
    case "npc":
      return npcFields(page);
    case "location":
    case "faction":
    case "item":
      return descriptionFields(page, kind);
    case "quest":
      return questFields(page);
    case "note":
      return noteFields(page);
  }
}
