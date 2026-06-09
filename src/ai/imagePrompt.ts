// Shared image-prompt construction for client-side AI generation.
// The matching Deno module lives at supabase/functions/_shared/image-prompt.ts —
// keep both in sync (the two runtimes can't share a single file).

// Tells the image model that the Subject is canonical when it conflicts with
// the Setting. Without this, the model averages the two — e.g. a butler
// described by the user gets rendered in winter survivalist gear because the
// campaign setting is "rugged wintry landscape".
export const SUBJECT_OVERRIDES_SETTING =
  "If the Subject describes clothing, profession, or appearance that does not fit the Setting (for example, a butler or noble indoors in an otherwise wintry land), render the Subject exactly as described. The Setting is only background atmosphere, not a wardrobe override.";

interface PromptParts {
  base: string;
  setting: string;
  subject: string;
}

/** Newline-joined, labelled prompt — used by NPC true portrait generation. */
export function buildLabelledImagePrompt({ base, setting, subject }: PromptParts): string {
  return [
    `Style: ${base}`,
    setting ? `Setting: ${setting}` : null,
    setting ? `Precedence: ${SUBJECT_OVERRIDES_SETTING}` : null,
    `Subject: ${subject}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** " — "-joined prompt — used by everything except NPC true portrait. */
export function buildSimpleImagePrompt({ base, setting, subject }: PromptParts): string {
  return [
    base,
    setting,
    setting ? SUBJECT_OVERRIDES_SETTING : null,
    subject,
  ]
    .filter(Boolean)
    .join(" — ");
}

// ── Image-prompt authoring (existing-entity "AI weighs in" step) ──────────────
// When generating art for an entity that ALREADY exists, the caller never types
// the entity type ("NPC" on the NPC page). The author prompt therefore states
// the kind itself so the model knows what kind of subject it is describing.

/** Human-readable noun per image-job kind, used in the author system prompt. */
export const KIND_NOUNS: Record<string, string> = {
  npc_portrait: "a character portrait of an NPC",
  monster:      "a creature illustration of a monster",
  item:         "an illustration of a single magic item or object",
  spell:        "an illustration of a spell's visual effect",
  location:     "an establishing illustration of a place",
  faction:      "a heraldic emblem or crest of a faction",
  group_portrait: "a group portrait of an adventuring party",
  party_member: "a character portrait of an adventurer",
  species:      "an illustration of a fantasy species or ancestry",
  puzzle:       "an illustration of a puzzle or contraption",
  chronicler:   "a scene illustration",
};

/**
 * System prompt for the text model that authors an image prompt from an
 * existing entity's facts. `kind` selects the subject noun so the model knows
 * what it is describing without the user spelling it out.
 */
export function buildImagePromptAuthorSystem(kind: string): string {
  const noun = KIND_NOUNS[kind] ?? "an illustration";
  return [
    `You are writing a prompt for an image generator. The subject is ${noun}.`,
    "Given the facts below, write one concise visual description of the subject's appearance.",
    "Describe only what should be visible in the image — physical appearance, attire, pose, mood, and notable details.",
    "Do not include game statistics, names, headings, or any preamble. Output only the description as a single paragraph.",
  ].join(" ");
}
