// Rules about a conversation's own row and the play session it sits in, apart from the queries that fetch them.
import { toPlainText } from "../_shared/ai-prompt.ts";
import { parsePendingRoll } from "../_shared/agent/playerRoll.ts";
import type { Prologue } from "../_shared/agent/prologue.ts";
import type { SessionRow } from "./turnTypes.ts";

type Row = Record<string, unknown>;

export function sessionRow(row: Row): SessionRow {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    campaign_id: row.campaign_id as string,
    kind: row.kind as string,
    summary: (row.summary as string | null) ?? null,
    summary_through_seq: Number(row.summary_through_seq),
    scene_location_id: (row.scene_location_id as string | null) ?? null,
    campaign_session_id: (row.campaign_session_id as string | null) ?? null,
    pressure_clock_id: (row.pressure_clock_id as string | null) ?? null,
    party_member_id: (row.party_member_id as string | null) ?? null,
    opened_play_session: row.opened_play_session === true,
    left_at: (row.left_at as string | null) ?? null,
    updated_at: String(row.updated_at),
    // Anything this code did not write reads as nothing asked: a roll is never scored against a DC it cannot trust.
    pending_roll: parsePendingRoll(row.pending_roll),
    fight_encounter_id: (row.fight_encounter_id as string | null) ?? null,
    pursuit_encounter_id: (row.pursuit_encounter_id as string | null) ?? null,
  };
}

/** The next play session's number: one after the highest, or 1 for a campaign that has had none. */
export function nextSessionNumber(last: { number?: unknown } | null): number {
  return last && typeof last.number === "number" ? last.number + 1 : 1;
}

/** The sitting `start_campaign_session` answered with (a row, or an array of one), and whether this call opened it rather than joined one already running. */
export function openedSession(data: unknown, running: readonly unknown[] | null): { id: string; opened: boolean } | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row.id === "string" ? { id: row.id, opened: (running ?? []).length === 0 } : null;
}

/** The opening scene, from the opening quest's entry beat; null when the campaign's story has already begun. */
export function prologueFrom(questId: string, beatId: string, beat: Row, turnsKept: number): Prologue | null {
  if (turnsKept > 0) return null;
  return {
    questId,
    beatId,
    beatTitle: (beat.title as string | null) ?? "",
    locationId: (beat.staged_at_location_id as string | null) ?? null,
    readAloud: toPlainText(beat.read_aloud as string | null),
  };
}
