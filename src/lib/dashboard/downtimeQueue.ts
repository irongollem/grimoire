import { getDowntimeActivity } from "@/data/downtimeActivities";
import type { DowntimeDraw } from "@/types/downtime.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The DM's between-sessions queue for the dashboard (#764).
 *
 * A `DowntimeDraw` only carries ids (`party_member_id`, `activity_key`), and
 * "who drew, what they drew" both need a join against data the widget already
 * fetches separately (the roster, the activity catalogue). Kept pure and apart
 * from the widget for the same reason as `dmScreenCard.ts`: the join and the
 * sort are cheap to test here and expensive to test through a mounted card.
 */

/** One pending draw as the queue shows it — everything already resolved to
 *  display strings, so the widget template does no lookups of its own. */
export interface DowntimeQueueRow {
  drawId: string;
  /** The character who holds the credit that was spent. A draw outlives the
   *  character it was drawn for if the roster later removes them, so this
   *  falls back to a marker rather than going blank. */
  characterName: string;
  /** The player's own name, when the roster recorded one. Null is a real
   *  answer — not every campaign fills this field in — and the widget falls
   *  back to the character name rather than inventing a value. */
  playerName: string | null;
  /** What is printed on the card face, or the raw key if a later deploy ever
   *  removes the archetype a draw was made against. */
  activityTitle: string;
  /** ISO timestamp of the draw. Formatting ("3h ago") is the widget's job. */
  drawnAt: string;
}

/**
 * Every `pending` draw, joined against the roster and the activity catalogue,
 * oldest first — the draw that has been waiting longest is the one the DM
 * should clear first.
 *
 * Resolved and cancelled draws are excluded entirely: this is a to-do queue,
 * not a history, and a resolved draw belongs on the board, not the dashboard.
 */
export function buildDowntimeQueue(
  draws: readonly DowntimeDraw[],
  members: readonly PartyMember[],
): DowntimeQueueRow[] {
  const membersById = new Map(members.map((member) => [member.id, member] as const));

  return draws
    .filter((draw) => draw.status === "pending")
    .map((draw) => {
      const member = membersById.get(draw.party_member_id);
      return {
        drawId: draw.id,
        characterName: member?.name ?? "??? (removed)",
        playerName: member?.player_name ?? null,
        activityTitle: getDowntimeActivity(draw.activity_key)?.title ?? draw.activity_key,
        drawnAt: draw.created_at,
      };
    })
    .sort((a, b) => new Date(a.drawnAt).getTime() - new Date(b.drawnAt).getTime());
}
