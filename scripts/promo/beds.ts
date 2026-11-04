/**
 * The background tunes under a long video, as plain arithmetic.
 *
 * A YouTube video runs far longer than the one-minute series theme, so the
 * theme keeps only its opening motif (over the logo) and its ending (over the
 * closing card), and the narration sits on a chain of longer tunes in the
 * theme's key, tempo and ensemble (`brand/bed-1.mp3`, `bed-2.mp3`, ...). Each
 * tune plays from its middle: a generated track opens with an introduction
 * and winds down to an ending, and neither belongs mid-video. The chain moves
 * to the next tune where a chapter starts, so the music changes when the topic
 * does, and comes back to the first tune when a video outlasts them all.
 */

/** Seconds of each tune skipped at its start (its introduction) and before its audible end (its ending). */
export const BED_SKIP_IN = 8;
export const BED_SKIP_OUT = 12;
/** How long one tune takes to hand over to the next; centred on the chapter start. */
export const BED_CROSSFADE = 4;
/** A tune plays at least this long before the chain moves on, so a run of short chapters does not hop between tunes. */
export const BED_MIN_RUN = 45;

/** The part of a tune file the chain may play, in seconds of the file. */
export interface BedWindow {
  start: number;
  end: number;
}

/** One stretch of one tune: `length` seconds of the file from `from`, placed at `at` in the program. */
export interface BedSegment {
  bed: number;
  from: number;
  at: number;
  length: number;
}

/** The playable window of a tune, given where its sound starts and stops in the file. */
export function bedWindow(lead: number, audibleEnd: number): BedWindow {
  return { start: lead + BED_SKIP_IN, end: audibleEnd - BED_SKIP_OUT };
}

export function planBeds(input: {
  /** Where in the program the bed starts and stops. */
  from: number;
  to: number;
  /** Program times at which a chapter starts. */
  chapterStarts: number[];
  beds: BedWindow[];
}): BedSegment[] {
  const { from, to, beds } = input;
  if (beds.length === 0 || to <= from) return [];
  const half = BED_CROSSFADE / 2;
  const segments: BedSegment[] = [];
  let at = from;
  for (let i = 0; at < to; i++) {
    const bed = i % beds.length;
    const window = beds[bed];
    const playable = window.end - window.start;
    if (playable <= BED_CROSSFADE) throw new Error(`bed-${bed + 1} is too short to play: ${playable.toFixed(1)}s after skipping its start and ending`);
    const latestEnd = at + playable;
    if (latestEnd >= to) {
      segments.push({ bed, from: window.start, at, length: to - at });
      break;
    }
    // The latest chapter start this tune can reach, after its minimum run; else hand over mid-chapter as late as it can.
    const switches = input.chapterStarts.filter((c) => c + half <= latestEnd && c - half >= at + BED_MIN_RUN && c + half < to);
    const handover = switches.length > 0 ? Math.max(...switches) : latestEnd - half;
    segments.push({ bed, from: window.start, at, length: handover + half - at });
    at = handover - half;
  }
  return segments;
}
