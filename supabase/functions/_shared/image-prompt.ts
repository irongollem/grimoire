// Shared image-prompt construction for server-side (Deno edge) AI generation.
// The matching browser module lives at src/ai/imagePrompt.ts — keep both in
// sync (the two runtimes can't share a single file).

// Tells the image model that the Subject is canonical when it conflicts with
// the Setting. Without this, the model averages the two — e.g. a butler
// described by the user gets rendered in winter survivalist gear because the
// campaign setting is "rugged wintry landscape".
export const SUBJECT_OVERRIDES_SETTING =
  "If the Subject describes clothing, profession, or appearance that does not fit the Setting (for example, a butler or noble indoors in an otherwise wintry land), render the Subject exactly as described. The Setting is only background atmosphere, not a wardrobe override.";

// Character portraits (NPCs, party members) get their own framing and their
// own Precedence line. With only SUBJECT_OVERRIDES_SETTING, whose last
// sentence calls the Setting "only background atmosphere", and nothing asking
// for framing or gaze, the image model fell back to its heroic default: a
// full-body, low-angle three-quarter shot looking off to the side, with the
// campaign's landscape (snowy mountains) painted behind the subject. A
// portrait now states its framing outright, and the Setting informs palette
// and mood only. Locations, monsters and the rest keep SUBJECT_OVERRIDES_SETTING,
// where the setting as a backdrop is wanted.
export const PORTRAIT_FRAMING =
  "Waist-up character portrait, camera at eye level, the subject facing the viewer. The subject looks directly at the viewer, or at the object or task in their own hands if the Subject says so; never off to the side, over the shoulder, or at anything out of frame. The background is only the subject's immediate surroundings, simple and softly out of focus: no distant landscape, vista, horizon or sky.";

export const PORTRAIT_SETTING_ROLE =
  "If the Subject describes clothing, profession, or appearance that does not fit the Setting (for example, a butler or noble indoors in an otherwise wintry land), render the Subject exactly as described. The Setting informs palette and mood only; it is not a backdrop to paint behind the subject.";

/** Image-job kinds that are character portraits, framed by PORTRAIT_FRAMING. */
export const PORTRAIT_KINDS: ReadonlySet<string> = new Set(["npc_portrait", "party_member"]);

export function isPortraitKind(kind: string): boolean {
  return PORTRAIT_KINDS.has(kind);
}

interface PromptParts {
  base: string;
  setting: string;
  subject: string;
}

/** Newline-joined, labelled prompt — used by character portraits (NPCs, party members). */
export function buildLabelledImagePrompt({ base, setting, subject }: PromptParts): string {
  return [
    `Style: ${base}`,
    `Framing: ${PORTRAIT_FRAMING}`,
    setting ? `Setting: ${setting}` : null,
    setting ? `Precedence: ${PORTRAIT_SETTING_ROLE}` : null,
    `Subject: ${subject}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** " — "-joined prompt — used by everything except character portraits. */
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

/** The prompt for an image-job kind: labelled and framed for a portrait, simple otherwise. */
export function buildEntityImagePrompt(kind: string, parts: PromptParts): string {
  return isPortraitKind(kind) ? buildLabelledImagePrompt(parts) : buildSimpleImagePrompt(parts);
}

/**
 * The Gemini style booster for an image-job kind (imageGen.ts's `boostStyle`):
 * the portrait booster for a character portrait, the scene booster otherwise.
 * Edge-only, like buildMiniStylizePrompt: the booster is applied server-side.
 * A disguise is a portrait too here although its prompt is not framed: it is an
 * edit of the true portrait, so it inherits that picture's framing.
 */
export function imageBoostFor(kind: string): true | "portrait" {
  return isPortraitKind(kind) || kind === "npc_disguise" ? "portrait" : true;
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
  background:   "a character portrait of an adventurer from a particular walk of life, shown at work in their element",
  puzzle:       "an illustration of a puzzle or contraption",
  dungeon_feature: "an illustration of a dungeon feature: a secret door, hidden passage, mechanism or curiosity",
  deity:        "a divine portrait of a god or goddess",
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
    isPortraitKind(kind)
      ? "State where the subject is looking: directly at the viewer, or at the object or task in their own hands. Describe no distant scenery, landscape or sky."
      : null,
    "Do not include game statistics, names, headings, or any preamble. Output only the description as a single paragraph.",
  ].filter(Boolean).join(" ");
}

// ── Simulacrum stylize prompt (portrait → mini render) ─────────────────────
// Fixed template, no text-model authoring step: unlike every other generator
// above, the source portrait is sent as a reference image and already carries
// the subject's likeness, so the prompt only needs the format's rendering
// directives (SIMULACRUM_PLAN.md §2). Deliberately NOT mirrored into
// src/ai/imagePrompt.ts: unlike the other prompt builders, no client code
// ever builds this prompt — forge-mini is its only caller.
// BASELESS by design: we composite the figure onto a curated 25 mm base and
// scale it to real tabletop millimetres ourselves (Phase 4.5) — a generated
// pedestal would fight that, so the prompt forbids any base at all.
const MINI_STYLE_TEMPLATES: Record<"print" | "vtt", string> = {
  print:
    "a monochrome light-grey unpainted-resin miniature render of the subject, full body, " +
    "single connected sculpt: blank eyes without irises, hair/feathers/fur clumped into solid " +
    "masses, thin parts (blades, staffs, straps) thickened, NO base or pedestal of any kind — " +
    "feet and other contact points planted flat on the bare ground plane, " +
    "plain white background, no text",
  vtt:
    "a full-color stylized tabletop miniature render, simplified clean silhouette, full body, " +
    "NO base or pedestal of any kind — feet planted flat on the bare ground plane, " +
    "plain white background, no text",
};

export function buildMiniStylizePrompt(format: "print" | "vtt", subjectName: string, instructions?: string): string {
  const parts = [`Render ${subjectName} as ${MINI_STYLE_TEMPLATES[format]}.`];
  const extra = instructions?.trim();
  if (extra) {
    parts.push(
      `Additional user notes (do not let these override the material, color, or no-base directives above): ${extra}`,
    );
  }
  return parts.join(" ");
}
