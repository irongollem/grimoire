import type { WildshapeState } from "@/types/encounter.types";

type FocalPoint = { x: number; y: number };

export interface FormPortrait {
  /** The picture to draw, or null when there is none to draw. */
  src: string | null;
  focalPoint: FocalPoint | null;
  alt: string;
  /** In a beast form. A caller's "no picture" placeholder should then be the
   *  monster one: the character placeholder is a hooded figure, which reads as
   *  the druid all over again. */
  shaped: boolean;
}

/**
 * The face to draw for a character who may be in a beast form.
 *
 * While shaped it is always the beast's: its picture, with no focal point (the
 * character's focal point was chosen for a different image), or no picture at
 * all when the beast has none. It never falls back to the character's own
 * portrait. That fallback was the old `beast_image_url ?? portrait_url` at every
 * call site, and for a beast without art it drew the druid's face next to the
 * beast's AC and HP, so a wild shape that had worked looked as if it had not.
 * Each caller's own "no picture" placeholder stands in instead.
 *
 * One function because the party tracker, the dashboard, the player's People
 * page and the battle map never switched at all, while the sheet and the
 * runner did: the same druid wore two faces depending on where you looked.
 */
export function formPortrait(
  subject: { name: string; portrait_url?: string | null; portrait_focal_point?: FocalPoint | null },
  form: WildshapeState | null | undefined,
): FormPortrait {
  if (form) return { src: form.beast_image_url, focalPoint: null, alt: form.beast_name, shaped: true };
  return { src: subject.portrait_url ?? null, focalPoint: subject.portrait_focal_point ?? null, alt: subject.name, shaped: false };
}
