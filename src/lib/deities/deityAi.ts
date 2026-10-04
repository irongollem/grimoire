import { CLERIC_DOMAINS, DEITY_ALIGNMENTS, type ClericDomain } from "@/types/deity.types";
import type { AiProvenance } from "@/ai/provenance";

/** The model's deity, after `normalizeDeityResult` has made it safe to store. */
export interface DeityAiResult {
  name: string;
  titles: string | null;
  alternate_names: string[];
  /** One of `DEITY_ALIGNMENTS`, or null when the model said anything else. */
  alignment: string | null;
  domains: ClericDomain[];
  portfolio: string | null;
  symbol: string | null;
  /** Plain text, converted to Tiptap JSON by the caller. */
  description: string;
  /** Plain text, converted to Tiptap JSON by the caller. */
  dm_notes: string;
  tags: string[];
  image_prompt: string;
  ai_provenance?: AiProvenance;
}

export interface DeityAiGenerated extends DeityAiResult {
  portrait_url: string | null;
}

const MAX_DOMAINS = 3;
const MAX_ALTERNATE_NAMES = 3;
const MAX_TAGS = 5;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value: unknown): string | null {
  const t = text(value);
  return t === "" ? null : t;
}

function strings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    const t = text(item);
    if (t) seen.add(t);
    if (seen.size >= max) break;
  }
  return [...seen];
}

function matchOne<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const t = text(value).toLowerCase();
  return allowed.find((a) => a.toLowerCase() === t) ?? null;
}

/**
 * Model output is untrusted: an alignment or domain outside the app's enums
 * would store a value no filter or chip can show, so unknown ones are dropped
 * (alignment becomes null, a domain is filtered out).
 *
 * Every edition draws on the full domain list. A deity's domains describe its
 * portfolio, not which cleric subclasses a player's handbook prints: the 2024
 * rules keep Knowledge, Nature, Tempest and the rest on their gods even though
 * the 2024 Player's Handbook gives clerics only four domains, so narrowing a
 * 2024 god to those four would be a house rule.
 */
export function normalizeDeityResult(raw: unknown): DeityAiResult {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const domains: ClericDomain[] = [];
  if (Array.isArray(r.domains)) {
    for (const d of r.domains) {
      const match = matchOne(d, CLERIC_DOMAINS);
      if (match && !domains.includes(match)) domains.push(match);
      if (domains.length >= MAX_DOMAINS) break;
    }
  }

  const result: DeityAiResult = {
    name: text(r.name),
    titles: textOrNull(r.titles),
    alternate_names: strings(r.alternate_names, MAX_ALTERNATE_NAMES),
    alignment: matchOne(r.alignment, DEITY_ALIGNMENTS),
    domains,
    portfolio: textOrNull(r.portfolio),
    symbol: textOrNull(r.symbol),
    description: text(r.description),
    dm_notes: text(r.dm_notes),
    tags: strings(r.tags, MAX_TAGS).map((t) => t.toLowerCase()),
    image_prompt: text(r.image_prompt),
  };
  if (r.ai_provenance && typeof r.ai_provenance === "object") {
    result.ai_provenance = r.ai_provenance as AiProvenance;
  }
  return result;
}

const CONSTRAINT_LIMIT = 400;

function clip(line: string): string {
  return line.length > CONSTRAINT_LIMIT ? `${line.slice(0, CONSTRAINT_LIMIT - 1)}…` : line;
}

export interface DeityConstraintInput {
  pantheonName?: string | null;
  /** The deities the chosen pantheon already holds. */
  pantheonDeities?: ReadonlyArray<{ name: string; portfolio: string | null }>;
  alignment?: string | null;
  primaryDomain?: string | null;
}

/** The deities line is clipped to the server's 400 character cap, dropping whole entries from the end. */
function deitiesLine(deities: ReadonlyArray<{ name: string; portfolio: string | null }>): string | null {
  if (deities.length === 0) return null;
  const prefix = "Existing deities in this pantheon (do not duplicate): ";
  const parts: string[] = [];
  for (const d of deities) {
    const entry = d.portfolio ? `${d.name} (${d.portfolio})` : d.name;
    const next = prefix + [...parts, entry].join("; ");
    if (next.length > CONSTRAINT_LIMIT) break;
    parts.push(entry);
  }
  if (parts.length === 0) return clip(prefix + deities[0].name);
  return prefix + parts.join("; ");
}

export function buildDeityConstraints(input: DeityConstraintInput): string[] {
  const lines: string[] = [];
  if (input.pantheonName) lines.push(clip(`Pantheon: ${input.pantheonName}`));
  if (input.pantheonName && input.pantheonDeities) {
    const line = deitiesLine(input.pantheonDeities);
    if (line) lines.push(line);
  }
  if (input.alignment) lines.push(clip(`Alignment: ${input.alignment}`));
  if (input.primaryDomain) lines.push(clip(`Primary domain: ${input.primaryDomain}`));
  return lines;
}

/** Entity facts the portrait author works from; used by the editor's portrait block. */
export function deityImageContextParts(deity: {
  name: string;
  titles: string | null;
  alignment: string | null;
  domains: readonly string[];
  portfolio: string | null;
  symbol: string | null;
}): (string | null)[] {
  return [
    deity.name,
    deity.titles,
    deity.alignment,
    deity.domains.length ? `domains of ${deity.domains.join(", ")}` : null,
    deity.portfolio ? `god of ${deity.portfolio}` : null,
    deity.symbol ? `holy symbol: ${deity.symbol}` : null,
  ];
}
