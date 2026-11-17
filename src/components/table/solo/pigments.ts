import type { VoicePigment } from "@/lib/table/speakerColours";

/**
 * A pigment as the two custom properties the story's boxes read: `--voice` for a box's edge and wash, `--voice-ink`
 * for the name (the tone tokens are surface strength; as text on parchment they are too pale, so the name takes the
 * darker ink the theme already derives). The fifth is the rubric, the app's own oxblood. Whole class strings, so
 * Tailwind sees every one.
 */
export const PIGMENT_CLASS: Record<VoicePigment, string> = {
  info: "[--voice:var(--tone-info)] [--voice-ink:var(--color-ink-info)]",
  caution: "[--voice:var(--tone-caution)] [--voice-ink:var(--color-ink-caution)]",
  arcane: "[--voice:var(--tone-arcane)] [--voice-ink:var(--color-ink-arcane)]",
  success: "[--voice:var(--tone-success)] [--voice-ink:var(--color-ink-success)]",
  rubric: "[--voice:var(--live-ink,var(--primary))] [--voice-ink:var(--live-ink,var(--primary))]",
};
