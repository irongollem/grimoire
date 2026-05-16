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
