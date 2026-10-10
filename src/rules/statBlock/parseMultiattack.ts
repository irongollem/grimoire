/**
 * Multiattack composition (#1017): "makes three attacks: one with its bite and two
 * with its claws", "makes two Claw attacks", "One Bite attack and one Kick attack".
 *
 * Every step must name another entry of the same stat block, exactly as printed.
 * When any part of the sentence cannot be mapped, the answer is an empty list and
 * the runner shows the prose instead; half a composition would roll the wrong turn.
 */
import type { MultiattackStep } from "../../types/statBlock.types.ts";
import { NUMBER_WORDS, baseName } from "./vocab.ts";

const COUNT = "(one|two|three|four|five|six|seven|eight|nine|ten|twice|once|an?|\\d+)";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Singular and plural spellings of a printed name, lowercase. */
function spellings(name: string): string[] {
  const n = name.toLowerCase();
  const out = new Set([n]);
  if (n.endsWith("s")) out.add(n.slice(0, -1));
  out.add(`${n}s`);
  out.add(`${n}es`);
  if (n.endsWith("y")) out.add(`${n.slice(0, -1)}ies`);
  if (n.endsWith("ife")) out.add(`${n.slice(0, -3)}ives`);
  if (n.endsWith("f")) out.add(`${n.slice(0, -1)}ves`);
  return [...out];
}

function toCount(word: string): number {
  const lower = word.toLowerCase();
  return /^\d+$/.test(lower) ? Number(lower) : NUMBER_WORDS[lower];
}

export function parseMultiattack(text: string, siblings: string[]): MultiattackStep[] {
  // Alternatives ("can replace one attack with ...") describe options, not the base turn.
  // Sentences after the base turn ("If both attacks hit...", "It can replace one attack...") are riders and options.
  const cut = text.search(
    /\b(?:can|may)\s+(?:also\s+)?(?:replace|substitute)\b|\bin place of\b|(?<=[.!]\s)(?:If|When|Whenever|Can replace|Alternatively)\b/i,
  );
  const body = cut >= 0 ? text.slice(0, cut) : text;

  const printed = new Map<string, string>();
  for (const sib of siblings) {
    const base = baseName(sib);
    if (!base || /^multiattack/i.test(base)) continue;
    const key = base.toLowerCase();
    if (!printed.has(key)) printed.set(key, sib);
  }
  if (printed.size === 0) return [];

  const lookup = new Map<string, string>();
  for (const [key, sib] of printed) {
    for (const form of spellings(key)) if (!lookup.has(form)) lookup.set(form, sib);
  }
  const alternation = [...lookup.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join("|");
  const NAME = `(${alternation})`;

  // COUNT [melee|ranged] [attacks] [with] [its|the...] NAME [attack(s)]
  const step = new RegExp(
    `\\b${COUNT}\\s+(?:(?:melee|ranged|weapon|more|additional)\\s+)*(?:(?:attacks?\\s+)?(?:with\\s+)?(?:(?:its|his|her|their|the|a|an|one of its)\\s+)?)${NAME}\\b(?:\\s+attacks?)?`,
    "gi",
  );
  const steps = new Map<string, number>();
  let consumed = body;
  for (const m of body.matchAll(step)) {
    const sib = lookup.get(m[2].toLowerCase());
    const count = toCount(m[1]);
    if (sib === undefined || !count) return [];
    // "longsword or shortbow": the alternative is not a second attack
    if (new RegExp(`^\\s*(?:or|and/or)\\s+(?:${alternation})\\b`, "i").test(body.slice(m.index + m[0].length))) return [];
    if (new RegExp(`\\b(?:or|and/or)\\s*$`, "i").test(body.slice(0, m.index))) return [];
    steps.set(sib, (steps.get(sib) ?? 0) + count);
    consumed = consumed.replace(m[0], " ");
  }
  if (steps.size === 0) return [];

  // Whatever the steps did not account for decides whether the composition is complete.
  const rest = consumed.replace(new RegExp(`\\b(?:${alternation})\\b`, "gi"), " ");
  if (/\b(?:or|alternatively|any combination|in any order|instead)\b/i.test(rest)) return [];
  // "one with a weapon": a counted attack the siblings could not name
  if (new RegExp(`\\b${COUNT}\\s+(?:\\w+\\s+)?with\\b`, "i").test(rest)) return [];
  // "uses Life Drain twice": a count after the name is a step we did not read
  if (new RegExp(`\\b(?:${alternation})\\s+(?:attacks?\\s+)?(?:twice|once|(?:\\w+|\\d+) times)\\b`, "i").test(body)) return [];
  if (!totalMatches(body, steps)) return [];
  return [...steps].map(([action, count]) => ({ action, count }));
}

/** "makes three attacks" must equal the sum of the named steps; true when no total is stated. */
function totalMatches(body: string, steps: Map<string, number>): boolean {
  const total = new RegExp(`\\bmakes?\\s+(?:up to\\s+)?${COUNT}\\s+(?:(?:melee|ranged|weapon)\\s+)?attacks?\\b(?!\\s+with)`, "i").exec(body);
  if (!total) return true;
  let sum = 0;
  for (const c of steps.values()) sum += c;
  return toCount(total[1]) === sum;
}
