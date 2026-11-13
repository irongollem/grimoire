import type { QuestBeatPresentation } from "./presentation";

/** Where a beat sits in the story: the node's fill. Priority is
 *  here (gold) > start (green) > past (white) > pending (grey). */
export type BeatFill = "here" | "start" | "past" | "pending";
/** The corner bookmark: what has happened to the beat. */
export type BeatBookmark = "untouched" | "done" | "here" | "failed" | "unreachable";

export interface BeatMark {
  fill: BeatFill;
  bookmark: BeatBookmark;
  /** Cut off from the party: faded, dashed and struck through. */
  unreachable: boolean;
  /** Text for screen readers; the bookmark itself is decorative. */
  label: string;
}

const LABELS: Record<BeatBookmark, string> = {
  untouched: "not yet played",
  done: "done",
  here: "party here",
  failed: "failed",
  unreachable: "unreachable",
};

/** One place decides how a beat reads, so the canvas node and the outline row
 *  can never disagree. `partyHere` covers a caller that has no presentation. */
export function beatMark(presentation: QuestBeatPresentation | undefined, isEntry: boolean, partyHere = false): BeatMark {
  const here = partyHere || presentation?.reach === "current";
  const unreachable = !here && presentation?.reach === "stranded";
  const visited = presentation?.reach === "visited";

  const fill: BeatFill = here ? "here" : isEntry ? "start" : visited ? "past" : "pending";
  const bookmark: BeatBookmark = presentation?.isFailed ? "failed"
    : here ? "here"
    : unreachable ? "unreachable"
    : visited ? "done"
    : "untouched";
  return { fill, bookmark, unreachable, label: LABELS[bookmark] };
}
