import type { QuestBeatTransition, QuestRuntimeStatus, QuestTransitionKind } from "@/types/quest.types";

export type BeatRecordKind = "here" | "played" | "recorded" | "unplayed";

/**
 * Where a single beat stands in the record, as read back from the transition
 * log — never as typed in by whoever is looking at the backfill panel. `at`
 * and `note` are `null` for `unplayed` (nothing has ever happened there) and
 * are populated from the newest transition otherwise; `note` carries the
 * `assert` reason (the session note the DM typed), never a table move's
 * reason, since table moves other than `jump` rarely carry one.
 */
export interface BeatRecordState {
  kind: BeatRecordKind;
  at: string | null;
  note: string | null;
}

type TransitionRow = Pick<QuestBeatTransition, "to_quest_id" | "to_beat_id" | "transition_kind" | "reason" | "created_at">;

/** Transition kinds that mean "the party actually walked through this at the
 * table" — as opposed to `assert`, a correction made in prep. */
const TABLE_TRANSITION_KINDS: ReadonlySet<QuestTransitionKind> = new Set([
  "enter",
  "forward",
  "jump",
  "return",
  "improv",
]);

/**
 * Reduces the transition log to one state per beat: `here` when the cursor
 * currently sits there (this wins over everything else — a beat can be both
 * "played" and "the beat the party is standing on right now"), `played` or
 * `recorded` from whichever kind the *newest* transition arriving there was,
 * and `unplayed` when no transition ever named it as a destination.
 *
 * Transitions are scanned rather than trusted to arrive pre-sorted — order is
 * whatever the caller's query returned — and only rows landing on THIS quest
 * with a real `to_beat_id` count: `pause`/`resume`/`end` transitions carry no
 * `to_beat_id`, and another quest's rows are noise here even if a beat id
 * happened to collide (it can't, but the filter costs nothing and documents
 * the assumption).
 */
export function deriveBeatRecordStates(input: {
  questId: string;
  beatIds: readonly string[];
  transitions: readonly TransitionRow[];
  currentBeatId: string | null;
}): Record<string, BeatRecordState> {
  const { questId, beatIds, transitions, currentBeatId } = input;

  const newestByBeat = new Map<string, TransitionRow>();
  for (const transition of transitions) {
    if (transition.to_quest_id !== questId || !transition.to_beat_id) continue;
    const existing = newestByBeat.get(transition.to_beat_id);
    if (!existing || new Date(transition.created_at).getTime() > new Date(existing.created_at).getTime()) {
      newestByBeat.set(transition.to_beat_id, transition);
    }
  }

  const states: Record<string, BeatRecordState> = {};
  for (const beatId of beatIds) {
    const newest = newestByBeat.get(beatId) ?? null;

    if (beatId === currentBeatId) {
      states[beatId] = {
        kind: "here",
        at: newest?.created_at ?? null,
        note: newest?.transition_kind === "assert" ? newest.reason : null,
      };
      continue;
    }

    if (!newest) {
      states[beatId] = { kind: "unplayed", at: null, note: null };
    } else if (newest.transition_kind === "assert") {
      states[beatId] = { kind: "recorded", at: newest.created_at, note: newest.reason };
    } else if (TABLE_TRANSITION_KINDS.has(newest.transition_kind)) {
      states[beatId] = { kind: "played", at: newest.created_at, note: newest.reason };
    } else {
      // A pause/resume/end row would have no to_beat_id and is filtered out
      // above, so this is unreachable with real data — kept as a safe default
      // rather than an assertion, since a new transition_kind arriving later
      // should degrade gracefully instead of mis-labelling a beat as played.
      states[beatId] = { kind: "unplayed", at: null, note: null };
    }
  }
  return states;
}

/** Turns a {@link BeatRecordState} into the short caption shown beside a beat
 * row. `formatDate` is injected rather than imported so this stays a pure
 * string transform to test. */
export function describeBeatRecordState(
  state: BeatRecordState,
  runtimeStatus: QuestRuntimeStatus | null,
  formatDate: (iso: string) => string,
): string {
  switch (state.kind) {
    case "here":
      return runtimeStatus === "running" ? "Playing now" : "The party is here";
    case "played":
      return state.at ? `Played · ${formatDate(state.at)}` : "Played";
    case "recorded":
      if (state.note) return `Recorded · ${state.note}`;
      return state.at ? `Recorded · ${formatDate(state.at)}` : "Recorded";
    case "unplayed":
      return "Not played";
  }
}
