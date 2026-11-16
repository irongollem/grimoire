// The database half of quests at the AI table (#1021): reading what is in play and applying a kept turn's moves.
//
// Everything here goes through the CALLER's client, because the quest functions check that `auth.uid()` is the
// campaign's DM and a service role has no such user. The one exception is the conversation's own row, which only the
// server writes, so that update takes the admin client. The rules (what may be named, what is shown, when a clock
// ticks) are in `_shared/agent/quests.ts`; this file stays thin on purpose, it has no test harness.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_THREADS,
  type ObjectiveStatus,
  type QuestMove,
  type QuestRoute,
  type QuestsInPlay,
  type QuestThread,
} from "../_shared/agent/quests.ts";

type Row = Record<string, unknown>;

function rows(data: unknown): Row[] {
  if (!Array.isArray(data)) throw new Error("expected a list of rows");
  return data.map((r) => {
    if (typeof r !== "object" || r === null) throw new Error("expected a row");
    return r as Row;
  });
}

function text(row: Row, key: string): string {
  const v = row[key];
  if (typeof v !== "string") throw new Error(`${key} is not text`);
  return v;
}

function textOrNull(row: Row, key: string): string | null {
  const v = row[key];
  return typeof v === "string" ? v : null;
}

function whole(row: Row, key: string): number {
  const v = Number(row[key]);
  if (!Number.isInteger(v)) throw new Error(`${key} is not a whole number`);
  return v;
}

const STATUSES: readonly string[] = ["dormant", "pending", "complete", "failed"];

/** The routes out of a thread's current beat, from `get_quest_runtime_context`. Only the fields the narrator needs. */
function routesOf(context: unknown): QuestRoute[] {
  if (typeof context !== "object" || context === null) throw new Error("no runtime context");
  const outgoing = (context as Row).outgoing;
  if (!Array.isArray(outgoing)) return [];
  return outgoing.map((o) => {
    const r = o as Row;
    const gate = r.gate;
    // A route with no gate is open; only a gate that says it is closed closes it.
    const open = typeof gate === "object" && gate !== null ? (gate as Row).is_open !== false : true;
    return {
      edgeId: text(r, "edge_id"),
      label: textOrNull(r, "label"),
      toBeatId: text(r, "beat_id"),
      toBeatTitle: text(r, "beat_title"),
      kind: r.route_kind === "parallel" ? "parallel" : "choice",
      open,
    };
  });
}

export async function loadQuests(
  client: SupabaseClient,
  campaignId: string,
  pressureClockId: string | null,
): Promise<QuestsInPlay> {
  const live = await client.rpc("get_campaign_live_quests", { p_campaign_id: campaignId });
  if (live.error) throw live.error;
  const liveRows = rows(live.data);

  // The runtime context is a large document per thread; only the first MAX_THREADS are shown, so only those are read.
  const contexts = await Promise.all(
    liveRows.slice(0, MAX_THREADS).map(async (r) => {
      const res = await client.rpc("get_quest_runtime_context", {
        p_campaign_id: campaignId,
        p_quest_id: text(r, "quest_id"),
        p_thread_id: text(r, "thread_id"),
      });
      if (res.error) throw res.error;
      return routesOf(res.data);
    }),
  );

  const questIds = [...new Set(liveRows.map((r) => text(r, "quest_id")))];
  const objectives = new Map<string, QuestThread["objectives"]>();
  const clocks = new Map<string, QuestThread["clocks"]>();
  let pressure: QuestsInPlay["pressure"] = null;
  if (questIds.length > 0) {
    const [objRes, clockRes] = await Promise.all([
      client.from("quest_objectives").select("id, quest_id, description, status").in("quest_id", questIds),
      client.from("quest_clocks").select("id, quest_id, label, segments, filled").eq("campaign_id", campaignId).in("quest_id", questIds),
    ]);
    if (objRes.error) throw objRes.error;
    if (clockRes.error) throw clockRes.error;
    for (const o of rows(objRes.data)) {
      const status = text(o, "status");
      if (!STATUSES.includes(status)) throw new Error(`unknown objective status ${status}`);
      const list = objectives.get(text(o, "quest_id")) ?? [];
      list.push({ id: text(o, "id"), description: text(o, "description"), status: status as ObjectiveStatus });
      objectives.set(text(o, "quest_id"), list);
    }
    for (const c of rows(clockRes.data)) {
      const clock = { id: text(c, "id"), label: text(c, "label"), filled: whole(c, "filled"), segments: whole(c, "segments") };
      const list = clocks.get(text(c, "quest_id")) ?? [];
      list.push(clock);
      clocks.set(text(c, "quest_id"), list);
      if (clock.id === pressureClockId) pressure = { clockId: clock.id, label: clock.label, filled: clock.filled, segments: clock.segments };
    }
  }

  // The pressure clock of a quest that is no longer live is still the conversation's clock: read it by id.
  if (pressureClockId !== null && pressure === null) {
    const res = await client.from("quest_clocks").select("id, label, segments, filled")
      .eq("id", pressureClockId).eq("campaign_id", campaignId).maybeSingle();
    if (res.error) throw res.error;
    if (res.data) {
      const c = res.data as Row;
      pressure = { clockId: text(c, "id"), label: text(c, "label"), filled: whole(c, "filled"), segments: whole(c, "segments") };
    }
  }

  const threads: QuestThread[] = liveRows.map((r, i) => {
    const beatId = textOrNull(r, "beat_id");
    const beatTitle = textOrNull(r, "beat_title");
    return {
      questId: text(r, "quest_id"),
      questTitle: text(r, "quest_title"),
      threadId: text(r, "thread_id"),
      threadLabel: textOrNull(r, "thread_label"),
      beat: beatId !== null && beatTitle !== null ? { id: beatId, title: beatTitle } : null,
      // A thread past the shown limit is never named, so its routes were not read.
      routes: i < contexts.length ? contexts[i] : [],
      objectives: objectives.get(text(r, "quest_id")) ?? [],
      clocks: clocks.get(text(r, "quest_id")) ?? [],
    };
  });
  return { threads, pressure };
}

/**
 * One kept move, written the way the quest screen writes it. Throws on any error; the caller logs it, and a move
 * that fails costs that move, never the turn.
 */
export async function applyQuestMove(
  client: SupabaseClient,
  admin: SupabaseClient,
  ctx: { campaignId: string; agentSessionId: string },
  move: QuestMove,
): Promise<void> {
  switch (move.kind) {
    case "route": {
      const { error } = await client.rpc("mark_quest_move", {
        p_campaign_id: ctx.campaignId,
        p_quest_id: move.questId,
        p_thread_id: move.threadId,
        p_kind: "route",
        p_edge_id: move.edgeId,
      });
      if (error) throw error;
      return;
    }
    case "beat": {
      const { error } = await client.rpc("mark_quest_move", {
        p_campaign_id: ctx.campaignId,
        p_quest_id: move.questId,
        p_thread_id: move.threadId,
        p_kind: move.failed ? "failed" : "party_here",
        p_beat_id: move.beatId,
      });
      if (error) throw error;
      return;
    }
    case "objective": {
      const { error } = await client.rpc("assert_quest_objective_status", {
        p_objective_id: move.objectiveId,
        p_status: move.status,
        p_reason: move.reason,
      });
      if (error) throw error;
      return;
    }
    case "clock": {
      const { error } = await client.rpc("tick_quest_clock", {
        p_clock_id: move.clockId,
        p_step: move.step,
        p_reason: move.reason,
      });
      if (error) throw error;
      return;
    }
    case "pressure": {
      let clockId: string | null = null;
      if (move.mode === "run") clockId = move.clockId;
      if (move.mode === "start") {
        const made = await client.from("quest_clocks")
          .insert({ campaign_id: ctx.campaignId, quest_id: move.questId, label: move.label, segments: move.segments })
          .select("id")
          .single();
        if (made.error) throw made.error;
        clockId = text(made.data as Row, "id");
      }
      // The admin client writes the conversation's own row; the campaign filter keeps it to this conversation's.
      const { error } = await admin.from("agent_sessions")
        .update({ pressure_clock_id: clockId })
        .eq("id", ctx.agentSessionId)
        .eq("campaign_id", ctx.campaignId);
      if (error) throw error;
      return;
    }
  }
}
