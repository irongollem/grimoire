import { SKILLS, type SkillProficiencies } from "@/types/party.types";

export type SkillKey = keyof SkillProficiencies;

export interface BackgroundSkillChoice {
  /** How many skills the player picks from `options`. */
  count: number;
  /** Candidate skill keys to choose from; empty means "any skill". */
  options: SkillKey[];
}

export interface ParsedBackgroundSkills {
  /** Skills the background grants unconditionally. */
  fixed: SkillKey[];
  /** Zero or more "choose N of …" groups the player resolves manually. */
  choices: BackgroundSkillChoice[];
}

// Words that begin a "choose one/two of …" clause. We split on the earliest
// occurrence: everything before it is a fixed grant, everything from it on is
// the choice clause.
const CHOICE_MARKERS = ["either", "your choice", "from among", "between", "plus"];

/** Every known skill mentioned in `text`, in SKILLS order, deduped. */
function skillsIn(text: string): SkillKey[] {
  const found: SkillKey[] = [];
  for (const s of SKILLS) {
    // Whole-token match so "Perception" never matches inside another word and
    // "Sleight of Hand" (with spaces) still matches.
    const re = new RegExp(`(^|[^a-z])${s.label.toLowerCase()}([^a-z]|$)`, "i");
    if (re.test(text.toLowerCase())) found.push(s.key);
  }
  return found;
}

/**
 * Reconstruct a background's skill intent from Open5e proficiency prose.
 *
 * The Open5e importer historically comma-split the prose into an array, which
 * mangles choice clauses — "Deception, and either Culture, Insight, or Sleight
 * of Hand." becomes `["Deception", "and either Culture", "Insight", "or Sleight
 * of Hand."]`. Naively granting every array entry that names a skill turns a
 * "choose one" into "grant all". This re-joins the array back into the original
 * sentence and parses it into fixed grants vs. a "choose N of …" clause.
 *
 * Safe on already-clean arrays: `["Deception", "Sleight of Hand"]` → both fixed,
 * no choice. Non-skill options the system doesn't model (e.g. "Culture",
 * "Engineering") are dropped from choice options.
 */
export function parseBackgroundSkills(
  raw: string[] | null | undefined,
): ParsedBackgroundSkills {
  if (!raw || raw.length === 0) return { fixed: [], choices: [] };

  const sentence = raw.join(", ").replace(/\s*\.\s*$/, "").trim();
  if (!sentence) return { fixed: [], choices: [] };

  const lower = sentence.toLowerCase();

  let markerIdx = -1;
  for (const m of CHOICE_MARKERS) {
    const idx = lower.indexOf(m);
    if (idx >= 0 && (markerIdx === -1 || idx < markerIdx)) markerIdx = idx;
  }

  // No choice language — every named skill is a fixed grant.
  if (markerIdx === -1) return { fixed: skillsIn(sentence), choices: [] };

  const fixed = skillsIn(sentence.slice(0, markerIdx));
  const options = skillsIn(sentence.slice(markerIdx)).filter((k) => !fixed.includes(k));
  const count = /\b(two|2)\b/i.test(sentence) ? 2 : 1;

  return { fixed, choices: [{ count, options }] };
}
