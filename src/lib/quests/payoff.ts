import type { LootPlacement, QuestBeat, QuestBeatEdge, QuestConsequence, QuestConsequenceAction } from "@/types/quest.types";
import { describeQuestConsequenceAction, type QuestConsequenceLabelResolver } from "./consequences";

/**
 * The Payoff list (Quest Manager Redesign, frame `03 Inspector`): the loot
 * panel and the consequences panel folded into one, because at the table
 * they are one thing — what this beat gives. Two mechanisms, one list: a
 * `quest_consequences` row fires from the engine on transition; a
 * `loot_placements` row waits for a DM to drop it. This module derives the
 * merged, display-ready rows; `QuestPayoffPanel.vue` only renders them.
 */

export type PayoffTone = "destructive" | "caution" | "info" | "arcane" | "primary" | "muted";
export type PayoffIcon = "invite" | "hand" | "scrollText" | "quest" | "coins" | "package" | "check" | "calendar" | "send" | "award";

export interface PayoffRow {
  /** The `quest_consequences.id` or `loot_placements.id` this row renders. */
  id: string;
  source: "consequence" | "loot";
  tone: PayoffTone;
  icon: PayoffIcon;
  /** Bold line: `describeQuestConsequenceAction` for a consequence, the
   *  loot's own quantity-prefixed label for loot. */
  summary: string;
  /** Small line: the verb name and its condition (`shift_npc_relationship ·
   *  on "he confesses"`), or `loot_placement · <kind> · <delivery state>`. */
  caption: string;
  /** "auto" fires from the engine; "you dispatch" is loot, a human action —
   *  the mechanism a row belongs to, not its current delivery state. */
  chip: "auto" | "you dispatch";
}

/**
 * Icon and tint per consequence verb. Ledger verbs (raise/reveal/complete/
 * fail) and the two world actions without a dedicated payoff meaning
 * (calendar event, broadcast) share the neutral "muted" treatment used
 * elsewhere for a ledger pill; the four verbs that carry their own kind of
 * reward each get the tone that kind means everywhere else in the app.
 */
const CONSEQUENCE_STYLE: Record<QuestConsequenceAction, { tone: PayoffTone; icon: PayoffIcon }> = {
  raise: { tone: "muted", icon: "check" },
  reveal: { tone: "muted", icon: "check" },
  complete: { tone: "muted", icon: "check" },
  fail: { tone: "muted", icon: "check" },
  create_calendar_event: { tone: "muted", icon: "calendar" },
  send_broadcast: { tone: "muted", icon: "send" },
  shift_npc_relationship: { tone: "destructive", icon: "invite" },
  unlock_quest: { tone: "arcane", icon: "quest" },
  grant_knowledge: { tone: "info", icon: "scrollText" },
  owe_favor: { tone: "caution", icon: "hand" },
  award_milestone: { tone: "muted", icon: "award" },
};

function beatTitle(beats: readonly QuestBeat[], id: string): string {
  return beats.find((beat) => beat.id === id)?.title || "Missing beat";
}

function delaySuffix(afterDays: number): string {
  return afterDays > 0 ? ` (+${afterDays}d)` : "";
}

/** `<verb> · on arrival` or `<verb> · on "<route target>"`, the style the
 *  story names: "verb name and condition." */
function consequenceCaption(row: QuestConsequence, outgoingEdges: readonly QuestBeatEdge[], beats: readonly QuestBeat[]): string {
  const edge = row.on_edge_id ? outgoingEdges.find((candidate) => candidate.id === row.on_edge_id) : undefined;
  const condition = edge ? `on "${beatTitle(beats, edge.target_beat_id)}"` : "on arrival";
  return `${row.action} · ${condition}${delaySuffix(row.after_days)}`;
}

function lootSummary(entry: LootPlacement): string {
  return entry.quantity > 1 ? `${entry.quantity}× ${entry.label}` : entry.label;
}

export interface DerivePayoffRowsInput {
  beatId: string;
  /** Every consequence the quest holds; narrowed here to this beat's own
   *  arrival rules plus the rules on its outgoing routes. */
  consequences: readonly QuestConsequence[];
  /** This beat's own outgoing edges — both the arrival/route filter and the
   *  route-target title come from this list. */
  outgoingEdges: readonly QuestBeatEdge[];
  /** Every beat in the quest, for resolving a route's target title. */
  beats: readonly QuestBeat[];
  /** This beat's own loot, already filtered to `beat_id === beatId`. */
  loot: readonly LootPlacement[];
  /** Resolves a ledger verb's target objective to its description. */
  objectiveLabel: (id: string | null) => string;
  /** Resolves an `unlock_quest` row's target quest and, when set, its entry
   *  beat — passed straight through to `describeQuestConsequenceAction`.
   *  Omitted, an unlock row still summarizes as the bare "Unlock a quest". */
  questLabel?: QuestConsequenceLabelResolver["questLabel"];
  beatLabel?: QuestConsequenceLabelResolver["beatLabel"];
}

/**
 * One list, in table order: this beat's own consequences (arrival, then
 * routes, in the order the query returned them), followed by its loot. Loot
 * has no condition of its own to sort by, so it simply comes last — the
 * ordering the frame draws (consequences read top to bottom before loot).
 */
export function derivePayoffRows(input: DerivePayoffRowsInput): PayoffRow[] {
  const outgoingIds = new Set(input.outgoingEdges.map((edge) => edge.id));
  const consequenceRows = input.consequences
    .filter((row) => row.on_beat_id === input.beatId || (row.on_edge_id !== null && outgoingIds.has(row.on_edge_id)))
    .map((row): PayoffRow => {
      const style = CONSEQUENCE_STYLE[row.action];
      return {
        id: row.id,
        source: "consequence",
        tone: style.tone,
        icon: style.icon,
        summary: describeQuestConsequenceAction(row, input.objectiveLabel, { questLabel: input.questLabel, beatLabel: input.beatLabel }),
        caption: consequenceCaption(row, input.outgoingEdges, input.beats),
        chip: "auto",
      };
    });
  const lootRows = input.loot.map((entry): PayoffRow => ({
    id: entry.id,
    source: "loot",
    tone: "primary",
    icon: entry.kind === "currency" ? "coins" : "package",
    summary: lootSummary(entry),
    caption: `loot_placement · ${entry.kind} · ${entry.delivery_state}`,
    chip: "you dispatch",
  }));
  return [...consequenceRows, ...lootRows];
}
