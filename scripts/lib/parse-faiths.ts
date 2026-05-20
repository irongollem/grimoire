/**
 * Pure parsing logic for a campaign faiths/deities markdown file.
 *
 * Expected source structure (one `## NAME` per deity, free-form body):
 *
 *   # FAITHS OF X
 *   ...preamble paragraphs...
 *
 *   ## Deity Name
 *
 *   _Primary: PeopleA. Honored variously by: PeopleB, PeopleC._
 *
 *   Bright-reading paragraph...
 *
 *   Deep-reading paragraph(s)...
 *
 *   **Cleric domains:** Life, Order, Peace. **Paladin Oath of X** sits naturally here.
 *
 *   _Among other peoples:_ extra cross-people notes.
 *
 *   _Closing italicized reading._
 *
 *   ---
 *
 *   ## Next Deity ...
 *
 * Skips top-level headings matching `SKIP_HEADING_PREFIXES` (group sections,
 * GM notes, player-facing meta blurbs).
 */

// Relative import (not `@/`): we need the runtime value CLERIC_DOMAINS, and
// tsx only resolves the `@/` alias for type-only imports — value imports must
// use a relative path that node can resolve at runtime.
import { CLERIC_DOMAINS, type ClericDomain } from "../../src/types/deity.types";

/** Top-level `## NAME` headings that are NOT individual deities. */
const SKIP_HEADING_PREFIXES = [
  "A Note",            // "A Note for Players"
  "Appendix",
];

/**
 * Heading text for the Folk and Margin Figures group section. The importer
 * routes `## Folk and Margin Figures` blocks to `parseFolkAndMargin` instead
 * of `parseFaith` (it contains multiple bold-lead paragraph entities).
 */
export const FOLK_AND_MARGIN_HEADING = "Folk and Margin Figures";

/** Canonical pantheon names — used as keys throughout and as DB row names. */
export const PANTHEON_HEAVENLY = "Heavenly Bodies";
export const PANTHEON_LESSER = "Lesser Deities";
export const PANTHEON_FOLK = "Folk and Margin Figures";

/**
 * Per-deity overrides for pantheon assignment. The `faiths.md` file's
 * structural categorization (top-level `## NAME` vs bold-lead in Folk section)
 * doesn't always match the lore-tier categorization the user wants in the DB.
 *
 *  - "The Saucer" has a full `## NAME` section but the preamble explicitly
 *    places her "below the lesser deities", part of the Heavenly Bodies tier.
 *  - "Old Tippet" has a full `## NAME` section because his entry is too rich
 *    for the bold-lead format, but the lore frames him as a folk-figure ("most
 *    of his people honor him the way folk-figures are honored" — line 65).
 *
 * Add new entries here when the lore-tier diverges from the file structure.
 */
const PANTHEON_OVERRIDES: Record<string, string> = {
  "The Saucer": PANTHEON_HEAVENLY,
  "Old Tippet": PANTHEON_FOLK,
};

/** A parsed deity ready for insertion or DB comparison. */
export interface FaithRecord {
  /** Display name written to `deities.name`. */
  name: string;
  /** Original `## ...` heading text (for sidecar lookup + idempotency). */
  raw_heading: string;
  /** Pantheon this deity belongs to — resolved to `pantheon_id` by the importer. */
  pantheon: string;
  titles: string | null;
  symbol: string | null;
  alignment: string | null;
  /** Filtered to `ClericDomain` enum values; unknown tokens (e.g. homebrew names) logged + dropped. */
  domains: ClericDomain[];
  /** Short prose summary of what the deity is "the patron of". */
  portfolio: string | null;
  /** Full body text concatenated into a single plain-text blob (matches NPC importer style). */
  description: string;
  /** GM-only notes (used for Three Suns to carry the campaign_book.md reveal content). */
  dm_notes: string | null;
  /** Tokens derived from `_Primary: X._` line + thematic keywords. */
  tags: string[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Re-export the shared name-matching primitives so existing import sites
// keep working. Implementation (substring + Levenshtein fuzzy matching)
// lives in `./name-matching.ts` and is shared with the chapter-NPC importer.
export { normalizeName, findPotentialDuplicates } from "./name-matching";

/** Split markdown on top-level `## ` headings. Returns (heading, body) pairs. */
export function splitFaithBlocks(text: string): Array<{ heading: string; body: string }> {
  const parts = text.split(/\n## /);
  const out: Array<{ heading: string; body: string }> = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i] ?? "";
    const nlIdx = part.indexOf("\n");
    const heading = (nlIdx === -1 ? part : part.slice(0, nlIdx)).trim();
    const body = nlIdx === -1 ? "" : part.slice(nlIdx + 1);
    out.push({ heading, body });
  }
  return out;
}

export function isSkipHeading(heading: string): boolean {
  return SKIP_HEADING_PREFIXES.some((p) => heading.startsWith(p));
}

// ─── per-deity extraction ───────────────────────────────────────────────────

const DOMAIN_LOOKUP = new Map<string, ClericDomain>(
  CLERIC_DOMAINS.map((d) => [d.toLowerCase(), d]),
);

/**
 * Extract the cleric domains from a `**Cleric domains:**` line.
 *
 * The line may contain mixed natural language ("The Open — Life, Knowledge.
 * The Close — Grave, Death (carefully)") plus follow-on sentences about
 * paladins/bards that we should ignore. We:
 *
 *  - Take only the first sentence ending with `.` or up to the next `**...**`.
 *  - Strip parenthetical asides.
 *  - Tokenize on commas + "and" + "—" + colons.
 *  - Filter to known `ClericDomain` enum values.
 *
 * `unknown` collects tokens that LOOK like domain proposals but aren't in the
 * canonical enum (e.g. "Mercy"), for the caller to surface as a warning.
 */
export function parseClericDomains(body: string): { domains: ClericDomain[]; unknown: string[] } {
  const m = body.match(/\*\*Cleric domains:\*\*\s*(.*?)(?=\n|$)/m);
  if (!m) return { domains: [], unknown: [] };
  let line = m[1] ?? "";

  // Cut off at the first follow-on `**X**` (e.g. "**Paladin Oath of Kindness**").
  const followOn = line.indexOf("**");
  if (followOn !== -1) line = line.slice(0, followOn);

  // Strip parentheticals
  line = line.replace(/\([^)]*\)/g, "");

  // Tokenize aggressively
  const tokens = line
    .split(/[,;:.—\-]| and /i)
    .map((t) => t.trim())
    .filter(Boolean);

  const domains: ClericDomain[] = [];
  const unknown: string[] = [];
  for (const tok of tokens) {
    const norm = tok.toLowerCase();
    // Strip leading articles like "The Open" → "open"
    const stripped = norm.replace(/^the\s+/, "").trim();
    const hit = DOMAIN_LOOKUP.get(stripped) ?? DOMAIN_LOOKUP.get(norm);
    if (hit) {
      if (!domains.includes(hit)) domains.push(hit);
    } else if (/^[a-z][a-z\s'-]+$/.test(stripped) && stripped.length >= 4 && stripped.length <= 20) {
      // Looks like a single-word domain candidate (not a sentence fragment)
      if (!/\b(the|of|with|that|sits|natural|pairing|paladin|cleric|bard|domain)\b/.test(stripped)) {
        if (!unknown.includes(stripped)) unknown.push(stripped);
      }
    }
  }
  return { domains, unknown };
}

/**
 * Parse the optional `_Primary: X. ..._` lead line.
 *
 * Variants seen in the wild:
 *   _Primary: Sippet. Honored variously by: Brewlings, Wicks._
 *   _Primary: Wick. Rarely honored elsewhere._               ← no people list
 *   _Primary: Slip (uneasy devotion). Honored elsewhere mostly with fear._
 *   _Primary: Hatchling. Honored variously by: Sippets (Open), Marrows (Close)._
 *
 * We extract `primary` from any of these. We only populate `honored_by` from
 * the canonical `Honored variously by: A, B, C.` form — vague phrasing like
 * "elsewhere mostly with fear" doesn't yield clean people-list tags.
 */
function parsePrimaryLine(body: string): { primary: string | null; honored_by: string[] } {
  // Greedy-but-not-past-`_`: match the whole italicized lead line.
  const m = body.match(/^_Primary:\s*([^.]+?)\.\s*([^_]*)_/m);
  if (!m) return { primary: null, honored_by: [] };
  const primary = (m[1] ?? "").replace(/\s*\([^)]*\)/g, "").trim();
  const rest = m[2] ?? "";

  const honoredMatch = rest.match(/Honored\s+variously\s+by:\s*([^.]+?)\./);
  const honored_by: string[] = [];
  if (honoredMatch) {
    const list = (honoredMatch[1] ?? "")
      .replace(/\s*\([^)]*\)/g, "")
      .split(/,| and /)
      .map((s) => s.trim())
      .filter(Boolean);
    honored_by.push(...list);
  }
  return { primary: primary || null, honored_by };
}

/** Extract a short portfolio summary from "The patron of X" or similar opener. */
function extractPortfolio(description: string): string | null {
  // The first body sentence after the _Primary_ line usually starts with "The patron of"
  // or "The X-spirit and the Y-spirit" etc. Grab the first sentence.
  const m = description.match(/^(?:[^_\n][^\n]*?[.!?])(?:\s|$)/);
  if (!m) return null;
  const sentence = m[0].trim();
  if (sentence.length > 250 || sentence.length < 15) return null;
  return sentence;
}

/** Strip the `_Primary..._` lead line + `_Among other peoples:_` markers + `---` trailers. */
function cleanDescriptionBody(body: string): string {
  return body
    .replace(/^_Primary:[^_]*_\s*\n*/m, "")
    .replace(/\n*-{3,}\s*$/, "")
    .replace(/\*\*Cleric domains:\*\*\s*[^\n]*\n*/g, "")
    .trim();
}

/** Build the tag set from primary race + honored-by peoples + name slug. */
function buildTags(primary: string | null, honored_by: string[], name: string): string[] {
  const tags: string[] = ["faith"];
  if (primary) {
    tags.push(`primary-${slug(primary)}`);
  }
  for (const p of honored_by) {
    const t = `honored-by-${slug(p)}`;
    if (!tags.includes(t)) tags.push(t);
  }
  // Add name slug for cross-referencing
  const nameSlug = slug(name);
  if (nameSlug && !tags.includes(nameSlug)) tags.push(nameSlug);
  return tags;
}

export function parseFaith(heading: string, body: string): FaithRecord | null {
  if (isSkipHeading(heading)) return null;

  const { primary, honored_by } = parsePrimaryLine(body);
  const { domains } = parseClericDomains(body);
  const description = cleanDescriptionBody(body);
  const portfolio = extractPortfolio(description);
  const tags = buildTags(primary, honored_by, heading);
  const pantheon = PANTHEON_OVERRIDES[heading] ?? PANTHEON_LESSER;

  return {
    name: heading,
    raw_heading: heading,
    pantheon,
    titles: null,
    symbol: null,
    alignment: null,
    domains,
    portfolio,
    description,
    dm_notes: null,
    tags,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Preamble parser — produces Three Suns from the lead-in paragraphs
// ────────────────────────────────────────────────────────────────────────────

/**
 * Detect the preamble's Three Suns reference and produce 3 stub-but-populated
 * records. `faiths.md` itself only mentions the Suns in passing; the meaningful
 * per-sun content comes from `campaign_book.md` (Part II, "The Three Suns" +
 * "What the Suns Are" + "How to Run the Suns"). That content is hardcoded
 * below — it's narrative reveal text the GM is expected to memorize, not
 * something that drifts. If campaign_book.md substantially revises the suns,
 * update this constant.
 *
 * The function activates only when the faiths.md preamble actually names the
 * Three Suns (looking for the canonical "the gold, the rose, and the purple"
 * phrasing). Returns [] if not found, so future campaigns whose faiths.md
 * doesn't have suns get no spurious rows.
 */
export function parsePreambleSuns(fullText: string): FaithRecord[] {
  // Slice to everything before first `## ` heading
  const firstHeading = fullText.indexOf("\n## ");
  const preamble = firstHeading === -1 ? fullText : fullText.slice(0, firstHeading);
  if (!/the gold,\s+the rose,\s+and the purple/i.test(preamble)) return [];
  return SUN_RECORDS;
}

const SUN_RECORDS: FaithRecord[] = [
  {
    name: "Gold Sun",
    raw_heading: "Gold Sun",
    pantheon: PANTHEON_HEAVENLY,
    titles: null,
    symbol: null,
    alignment: null,
    domains: [],
    portfolio: "The dream-self — the compensatory shape the dream gave the sleeper.",
    description:
      "A gold one, low and warm — the sun the Sothern think of when they think of the sun, the one that ripens the marmalade and lights the windows of Cup Town in the late afternoon.",
    dm_notes:
      "**What it is (GM-only)**\n\n" +
      "The gold sun is the dream-self. The Sippet, the Wick, the Brewling, the beautiful compensatory shape the dream gave the sleeper. It is low and warm because the dream loves this self. It is the one the Sothern think of when they think of the sun, because the dream-self is the only self the Sothern are. It rises and sets on the body the PC is currently inhabiting. The gold sun is what the PC sees in the mirror.\n\n" +
      "**Practical: name the light**\n\n" +
      "A scene at golden hour is lit by the gold sun, low and warm.",
    tags: ["faith", "heavenly-body", "sun", "gold", "high-cosmology", "dream-self", "session-zero-discussion"],
  },
  {
    name: "Rose Sun",
    raw_heading: "Rose Sun",
    pantheon: PANTHEON_HEAVENLY,
    titles: null,
    symbol: null,
    alignment: null,
    domains: [],
    portfolio: "The pair-self — the waking person, the one in the envelope. Rose-tinted memory of who you were before the wound.",
    description:
      "A rose one, higher and smaller, softer — a steady pink-orange that travels slower across the sky than the gold one does.",
    dm_notes:
      "**What it is (GM-only)**\n\n" +
      "The rose sun is the pair-self. The waking person, the one in the envelope. It is higher and smaller because the waking self is farther away than the dream-self, viewed from inside the dream. It is softer because the dream renders the waking self in flattering light, rose-tinted memory, the romanticized version of the person you used to be before the wound. It travels slower across the sky because the waking world moves at its own pace, which is not the dream's pace. The rose sun is what the PC sees when they catch their reflection in a pool of marmalade and find someone almost familiar looking back. It is the sun whose light is gentlest in the prologue's tea, the tea that is \"the exact tea each PC would have wanted to be drinking right now.\"\n\n" +
      "**Practical: long-rest dreams**\n\n" +
      "Long-rest dreams happen under the rose sun. When a PC dreams of rectangular windows, a beeping sound, hands they do not recognize, that is the rose sun's light, briefly closer than usual. The deep-lens glimpses always happen in that light. A PC who eventually notices the connection has earned a real piece of the campaign's structure.\n\n" +
      "A scene of remembered tenderness, or of catching one's reflection unexpectedly, has the rose sun in it somewhere.",
    tags: ["faith", "heavenly-body", "sun", "rose", "high-cosmology", "pair-self", "long-rest-dreams", "session-zero-discussion"],
  },
  {
    name: "Purple Sun",
    raw_heading: "Purple Sun",
    pantheon: PANTHEON_HEAVENLY,
    titles: null,
    symbol: null,
    alignment: null,
    domains: [],
    portfolio: "The act of dreaming — the sustained, costly holding of the dream open. Wrong in the way a kindness gone on too long is wrong.",
    description:
      "A third one, off to the side, that is purple in a way that is wrong.\n\n" +
      "The wrong purple is not a color the eye wants. It is not bright. It is not painful in the ordinary way. It is the color of something left out too long, the inside of a bruise, the stain at the bottom of a cup nobody washed, the sky in a photograph taken in a year the viewer cannot quite place. Sothern have decided, collectively and without ever discussing it, not to look at that sun directly. They will tell you it is there. They will not tell you what color it is.",
    dm_notes:
      "**What it is (GM-only)**\n\n" +
      "The purple sun is the act of dreaming. Not the dreamer, not the dream-self, the dreaming. The sustained, costly, generations-long act of holding the dream open. The purple is wrong because the dreaming is wrong: not evil, not malicious, but wrong in the way a kindness that has gone on too long is wrong. It has been left out too long. It is the color of a bruise because somebody is bruising themselves to keep the dream up, and the PCs have decided, with the rest of Sothery, not to look at who.\n\n" +
      "This is what makes the purple sun bearable in the prologue: the PCs (and the players) genuinely cannot bear to look at it yet, because they do not know what it is, and the dream protects them from looking by ensuring they forget they decided not to. The dream is gentle with its own truth. The purple sun is the same kind of mercy as the lantern log entry with no word after it, the campaign showing you the shape of the answer before you can hold it.\n\n" +
      "**Practical: how to handle**\n\n" +
      "The Sothern never name the purple sun. They will say \"the wrong one\" if they say anything. Most will not say anything. A Sippet asked directly about it will go quiet, look down at their tea, and the moment will pass.\n\n" +
      "PCs can ask. NPCs cannot answer. No NPC in the campaign has words for the purple sun, including the Witch, until the climax. If a PC presses, the NPC's confusion is sincere. They have lived their whole lives under this sky. The wrong sun is just the sky.\n\n" +
      "The purple sun gets worse, very slowly, across the campaign. As the Stain Clock advances, the purple grows a hair more wrong each chapter. By Chapter 8 it is hard to look at even peripherally. A perceptive PC may notice this. They will not be confirmed.",
    tags: ["faith", "heavenly-body", "sun", "purple", "high-cosmology", "act-of-dreaming", "stain", "session-zero-discussion"],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Folk and Margin Figures parser — produces records from bold-lead paragraphs
// ────────────────────────────────────────────────────────────────────────────

/**
 * Names within the Folk and Margin Figures section that are NOT individual
 * entities — typically meta-paragraphs about a topic covered elsewhere.
 * "The Three Suns directly" is a paragraph about serving a sun rather than a
 * lesser deity; the actual sun entities are produced by `parsePreambleSuns`.
 */
const FOLK_META_SKIPS = new Set(["The Three Suns directly"]);

/**
 * Parse the body of `## Folk and Margin Figures` into one record per
 * `**Name.** ...` bold-lead paragraph. Strips the bold-lead from the
 * description body so it doesn't appear duplicated in the rendered prose.
 */
export function parseFolkAndMargin(body: string): FaithRecord[] {
  const out: FaithRecord[] = [];
  // Each entry starts with `**Name.**` at paragraph-start. Find them.
  const pattern = /(?:^|\n\n)\*\*([^*]+?)\.\*\*\s+([\s\S]*?)(?=\n\n\*\*[^*]+?\.\*\*|\n\n---|\n\n## |$)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const name = m[1]!.trim();
    if (FOLK_META_SKIPS.has(name)) continue;
    const description = m[2]!.trim().replace(/\n*-{3,}\s*$/, "").trim();
    const tags = ["faith", "folk-figure", "margin-figure", "session-zero-discussion", slug(name)];
    out.push({
      name,
      raw_heading: name,
      pantheon: PANTHEON_FOLK,
      titles: null,
      symbol: null,
      alignment: null,
      domains: [],
      portfolio: null,
      description,
      dm_notes: null,
      tags,
    });
  }
  return out;
}
