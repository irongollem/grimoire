/**
 * Where the series theme plays, and how loud, as plain arithmetic.
 *
 * The theme was generated from a brief with a timeline (docs/promo-videos.md):
 * a four-note motif alone from 0:00 to 0:04, an even underscore from 0:04 to
 * 0:50, and the motif again from 0:50, resolving to a final chord. So the motif
 * plays at full level over the opening logo, the underscore sits under the
 * narration (looping its 0:04 to 0:50 stretch when a Reel runs long, so the
 * motif never comes back mid-episode), and the theme's own ending is placed so
 * its final chord rings out over the closing card.
 */

/** Section boundaries in the theme, in seconds, from the brief. */
export const THEME_MOTIF_END = 4;
export const THEME_BODY_END = 50;
/** Levels in dB: the motif and the ending stand alone; the bed sits under a voice. */
export const FULL_DB = -6;
export const BED_DB = -22;
export const SILENT_DB = -60;
/** The bed hands over to the ending over this long. */
export const CROSSFADE = 1.5;
/** How long the motif takes to settle to the bed once the logo is gone. */
const SETTLE = 0.8;
/** The ending starts this long before the closing card, so the return of the motif is heard. */
const ENDING_LEAD = 2.5;

export interface Range {
  from: number;
  to: number;
}

/** A level at a moment of the program; levels between two points are linear in dB. */
export interface GainPoint {
  t: number;
  db: number;
}

export interface ThemePlan {
  /** Stretches of the theme played back to back from the start of the program. */
  body: Range[];
  /** Length of the body in the program (it overlaps the tail by the crossfade). */
  bodyLength: number;
  bodyGain: GainPoint[];
  /** Where in the theme the ending starts, and where in the program it lands. */
  tail: { from: number; at: number };
  tailGain: GainPoint[];
}

export function planTheme(input: {
  /** Program length. */
  total: number;
  /** Opening card length, 0 when there is none. */
  intro: number;
  /** Closing card length, 0 when there is none. */
  outro: number;
  /** Length of the theme file. */
  themeDuration: number;
  /** Silence at the start of the theme file, skipped so the motif starts with the logo. */
  lead: number;
}): ThemePlan {
  const { total, intro, outro, themeDuration, lead } = input;
  const tailLength = Math.min(outro + ENDING_LEAD, themeDuration - THEME_BODY_END, total);
  const tailAt = Math.max(0, total - tailLength);
  const bodyLength = Math.min(total, tailAt + CROSSFADE);

  const body: Range[] = [];
  let covered = 0;
  let from = lead;
  while (covered < bodyLength) {
    const to = Math.min(THEME_BODY_END, from + (bodyLength - covered));
    body.push({ from, to });
    covered += to - from;
    from = THEME_MOTIF_END;
  }

  const bodyGain: GainPoint[] =
    intro > 0
      ? [{ t: 0, db: FULL_DB }, { t: intro, db: FULL_DB }, { t: intro + SETTLE, db: BED_DB }]
      : [{ t: 0, db: SILENT_DB }, { t: 0.5, db: BED_DB }];
  bodyGain.push({ t: tailAt, db: BED_DB }, { t: bodyLength, db: SILENT_DB });

  const outroStart = total - outro;
  const tailGain: GainPoint[] = [{ t: tailAt, db: SILENT_DB }, { t: tailAt + CROSSFADE, db: BED_DB }];
  if (outro > 0) {
    tailGain.push({ t: Math.max(tailAt + CROSSFADE, outroStart - 1), db: BED_DB }, { t: outroStart, db: FULL_DB }, { t: total, db: FULL_DB });
  }

  return { body, bodyLength, bodyGain, tail: { from: themeDuration - tailLength, at: tailAt }, tailGain };
}

/**
 * An ffmpeg `volume` expression (linear amplitude, evaluated per frame) that
 * follows the gain points, holding the first level before them and the last after.
 */
export function gainExpression(points: GainPoint[]): string {
  const amp = (db: string) => `pow(10\\,(${db})/20)`;
  const last = points[points.length - 1];
  let expr = amp(String(last.db));
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i];
    const b = points[i + 1];
    const span = b.t - a.t;
    const db = span > 0 ? `${a.db}+(${b.db - a.db})*(t-${a.t})/${span}` : String(b.db);
    expr = `if(lt(t\\,${b.t})\\,${amp(db)}\\,${expr})`;
  }
  return `if(lt(t\\,${points[0].t})\\,${amp(String(points[0].db))}\\,${expr})`;
}
