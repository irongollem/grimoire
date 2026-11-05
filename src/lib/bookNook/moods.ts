/**
 * The studio's moods: one colour grade each, named for the hour or the light they suit. A scene stores only the
 * grade (`scene.grade`), so a mood is a vocabulary over it, like `presets.ts` is over motions: `moodOf` tells
 * which mood a stored grade is, or that it was tuned by hand.
 */
import type { Grade } from "./scene.ts";

export type MoodId = "none" | "dawn" | "candlelit" | "moonlight" | "overcast" | "ember";

export interface Mood {
  id: MoodId;
  label: string;
  grade: Grade;
}

export const MOODS: readonly Mood[] = [
  { id: "none", label: "None", grade: { tint: { color: [255, 255, 255], amount: 0 }, vignette: 0 } },
  { id: "dawn", label: "Dawn", grade: { tint: { color: [255, 205, 160], amount: 0.14 }, vignette: 0.15 } },
  { id: "candlelit", label: "Candlelit", grade: { tint: { color: [255, 170, 80], amount: 0.2 }, vignette: 0.35 } },
  { id: "moonlight", label: "Moonlight", grade: { tint: { color: [110, 140, 220], amount: 0.22 }, vignette: 0.3 } },
  { id: "overcast", label: "Overcast", grade: { tint: { color: [170, 180, 190], amount: 0.16 }, vignette: 0.1 } },
  { id: "ember", label: "Ember", grade: { tint: { color: [255, 110, 50], amount: 0.24 }, vignette: 0.4 } },
];

/** A grade within this of a mood's number reads as that mood (sliders and rounding drift a little). */
const CLOSE = 0.01;

export function gradeOf(id: MoodId): Grade {
  const mood = MOODS.find((m) => m.id === id);
  if (!mood) throw new Error(`There is no mood "${id}".`);
  // A copy: the scene must never share an object with this table, or editing one nook would repaint every default.
  return { tint: { color: [...mood.grade.tint.color], amount: mood.grade.tint.amount }, vignette: mood.grade.vignette };
}

/** The mood a grade is, or "custom" for anything else. A grade with no tint at all is None whatever its colour. */
export function moodOf(grade: Grade): MoodId | "custom" {
  for (const mood of MOODS) {
    const g = mood.grade;
    const sameVignette = Math.abs(grade.vignette - g.vignette) <= CLOSE;
    if (!sameVignette) continue;
    const bothUntinted = grade.tint.amount <= CLOSE && g.tint.amount <= CLOSE;
    if (bothUntinted) return mood.id;
    const sameTint =
      Math.abs(grade.tint.amount - g.tint.amount) <= CLOSE && grade.tint.color.every((c, i) => c === g.tint.color[i]);
    if (sameTint) return mood.id;
  }
  return "custom";
}
