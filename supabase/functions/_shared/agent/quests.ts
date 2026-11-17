// Quests and time at the AI table (#1021). Pure: no I/O.
//
// The narrator could read the campaign and file facts but could not move a quest forward, and it had no feel for how
// long a scene had gone on (maintainer, 16 Nov 2026: "If certain urgency is needed a conversation can't simply drag
// on forever"). So each turn it is shown the quests in play, it gets tools that mark what happened through the same
// database functions the quest screen calls, and urgency is a quest clock the SERVER counts turns against.
//
// Three rules shape everything below:
//   1. Nothing a quest tool does is written until the turn is kept. Objectives and clocks have no undo, and a turn
//      that is not kept (a save conflict, a provider error) is sent again by the player, so a write made at once
//      would be made twice. A tool therefore checks against the state loaded at the start of the turn, answers with
//      what WILL happen, and queues the move; the handler applies the queue after the save.
//   2. A tool may only name ids the narrator was shown this turn. A model invents and confuses ids, and the tools
//      take no campaign id, so the loaded state is the whole list of what may be touched.
//   3. The server counts time. The narrator never ticks the pressure clock to pass a turn; the server does, and tells
//      the narrator at the start of the turn when this turn's tick will fill it.

import type { AgentTool, ToolAnswer } from "./types.ts";

export const MAX_THREADS = 8;
export const MAX_ROUTES = 8;
export const MAX_OBJECTIVES = 12;
export const MAX_CLOCKS = 6;
export const REASON_MAX = 200;
export const CLOCK_LABEL_MAX = 80;
/** How far the narrator may push a clock in one call. A clock that jumps to full skips the tension it exists for. */
export const CLOCK_STEP_MAX = 4;

export type ObjectiveStatus = "dormant" | "pending" | "complete" | "failed";

export interface QuestRoute {
  edgeId: string;
  label: string | null;
  toBeatId: string;
  toBeatTitle: string;
  kind: "choice" | "parallel";
  /** False when the route's gate is closed. */
  open: boolean;
}

export interface QuestThread {
  questId: string;
  questTitle: string;
  threadId: string;
  threadLabel: string | null;
  beat: { id: string; title: string } | null;
  routes: QuestRoute[];
  /** The quest's, repeated on each of its threads. */
  objectives: { id: string; description: string; status: ObjectiveStatus }[];
  clocks: { id: string; label: string; filled: number; segments: number }[];
}

export interface QuestsInPlay {
  threads: QuestThread[];
  /** The clock this conversation counts turns against, with where it stands (it may belong to a quest no longer live). */
  pressure: { clockId: string; label: string; filled: number; segments: number } | null;
}

export const NO_QUESTS: QuestsInPlay = { threads: [], pressure: null };

// --- what the narrator is shown -------------------------------------------------------------------------------

interface ShownThread extends QuestThread {
  moreRoutes: number;
}

interface ShownQuest {
  questId: string;
  questTitle: string;
  threads: ShownThread[];
  objectives: QuestThread["objectives"];
  moreObjectives: number;
  clocks: QuestThread["clocks"];
  moreClocks: number;
}

interface Shown {
  quests: ShownQuest[];
  moreThreads: number;
}

/** What the section prints, and so the whole list of ids a tool may name. Both read this one function. */
function shownOf(state: QuestsInPlay): Shown {
  const threads = state.threads.slice(0, MAX_THREADS);
  const quests: ShownQuest[] = [];
  for (const t of threads) {
    let quest = quests.find((q) => q.questId === t.questId);
    if (!quest) {
      // Dormant objectives are not raised yet: the narrator is not shown them and so cannot name them.
      const raised = t.objectives.filter((o) => o.status !== "dormant");
      quest = {
        questId: t.questId,
        questTitle: t.questTitle,
        threads: [],
        objectives: raised.slice(0, MAX_OBJECTIVES),
        moreObjectives: Math.max(0, raised.length - MAX_OBJECTIVES),
        clocks: t.clocks.slice(0, MAX_CLOCKS),
        moreClocks: Math.max(0, t.clocks.length - MAX_CLOCKS),
      };
      quests.push(quest);
    }
    quest.threads.push({ ...t, routes: t.routes.slice(0, MAX_ROUTES), moreRoutes: Math.max(0, t.routes.length - MAX_ROUTES) });
  }
  return { quests, moreThreads: Math.max(0, state.threads.length - threads.length) };
}

/** Every clock the narrator was shown: those of the quests listed and the pressure clock. */
function shownClock(state: QuestsInPlay, shown: Shown, id: string): { label: string; filled: number; segments: number } | null {
  for (const q of shown.quests) {
    const found = q.clocks.find((c) => c.id === id);
    if (found) return found;
  }
  return state.pressure !== null && state.pressure.clockId === id ? state.pressure : null;
}

const HEADING = "## Quests in play";

/** Whether this turn's tick fills the pressure clock: the server adds one at the end of every kept turn. */
function fillsThisTurn(pressure: NonNullable<QuestsInPlay["pressure"]>): boolean {
  return pressure.filled + 1 >= pressure.segments;
}

export function questsSection(state: QuestsInPlay): string {
  const shown = shownOf(state);
  const lines: string[] = [HEADING, ""];
  if (shown.quests.length === 0) {
    lines.push("No quest is under way.");
  } else {
    lines.push(
      "Where each quest stands. Use these ids exactly as listed when you mark what happened. A route marked " +
        "closed has a condition that is not met yet.",
      "",
    );
    for (const q of shown.quests) {
      lines.push(`Quest: ${q.questTitle}, id ${q.questId}`);
      for (const t of q.threads) {
        const where = t.beat ? `at beat "${t.beat.title}" (beat id ${t.beat.id})` : "at no beat yet";
        lines.push(`  Thread${t.threadLabel ? ` "${t.threadLabel}"` : ""}, id ${t.threadId}: ${where}`);
        if (t.routes.length === 0 && t.moreRoutes === 0) lines.push("    No route leads out of this beat.");
        for (const r of t.routes) {
          const name = r.label ? `"${r.label}", ` : "";
          const flags = `${r.kind === "parallel" ? " (also, at the same time)" : ""}${r.open ? "" : " [closed]"}`;
          lines.push(`    Route id ${r.edgeId}: ${name}leads to "${r.toBeatTitle}" (beat id ${r.toBeatId})${flags}`);
        }
        if (t.moreRoutes > 0) lines.push(`    and ${t.moreRoutes} more routes.`);
      }
      if (q.objectives.length > 0 || q.moreObjectives > 0) {
        lines.push("  Objectives:");
        for (const o of q.objectives) lines.push(`    - id ${o.id} [${o.status}]: ${o.description}`);
        if (q.moreObjectives > 0) lines.push(`    and ${q.moreObjectives} more objectives.`);
      }
      if (q.clocks.length > 0 || q.moreClocks > 0) {
        lines.push("  Clocks:");
        for (const c of q.clocks) lines.push(`    - id ${c.id}: ${c.label}, ${c.filled} of ${c.segments}`);
        if (q.moreClocks > 0) lines.push(`    and ${q.moreClocks} more clocks.`);
      }
      lines.push("");
    }
    if (shown.moreThreads > 0) lines.push(`and ${shown.moreThreads} more threads are running that are not shown.`, "");
    lines.pop();
  }

  const p = state.pressure;
  if (p !== null) {
    lines.push(
      "",
      "### Pressure",
      `This scene runs against the clock "${p.label}" (clock id ${p.clockId}), at ${p.filled} of ${p.segments}. ` +
        "The server advances it by one at the end of every turn; do not tick it to pass time.",
    );
    if (fillsThisTurn(p)) {
      lines.push(
        `This turn it fills. What "${p.label}" counts down to happens in this reply, whatever the conversation was ` +
          "doing: make it happen now, before you ask what the player does.",
      );
    }
  }
  return lines.join("\n");
}

// --- moves ----------------------------------------------------------------------------------------------------

export type QuestMove =
  | { kind: "route"; questId: string; threadId: string; edgeId: string }
  | { kind: "beat"; questId: string; threadId: string; beatId: string; failed: boolean }
  | { kind: "objective"; objectiveId: string; status: "pending" | "complete" | "failed"; reason: string }
  | { kind: "clock"; clockId: string; step: number; reason: string }
  | { kind: "pressure"; mode: "run"; clockId: string }
  | { kind: "pressure"; mode: "start"; questId: string; label: string; segments: number }
  | { kind: "pressure"; mode: "stop" };

export const QUEST_ROUTE_TOOL = "quest_route";
export const QUEST_BEAT_TOOL = "quest_beat";
export const QUEST_OBJECTIVE_TOOL = "quest_objective";
export const QUEST_CLOCK_TOOL = "quest_clock";
export const PRESSURE_TOOL = "pressure";

const NOTE =
  " The change is made when the turn is kept, not at once, and the answer says what will happen.";

const idProp = (what: string) => ({ type: "string", description: `${what}, exactly as listed under "Quests in play".` });
const reasonProp = { type: "string", minLength: 1, maxLength: REASON_MAX, description: "One short sentence of why, for the quest's log." };

export const QUEST_TOOLS: AgentTool[] = [
  {
    name: QUEST_ROUTE_TOOL,
    description:
      "The party took one of the routes out of a quest's current beat. Use it the moment they commit to it in play, " +
        "with the route id listed under the thread. It moves the quest on and fires whatever that beat sets off." + NOTE,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { quest_id: idProp("The quest's id"), thread_id: idProp("The thread's id"), edge_id: idProp("The route's id") },
      required: ["quest_id", "thread_id", "edge_id"],
    },
  },
  {
    name: QUEST_BEAT_TOOL,
    description:
      "The party is at this beat of a quest, or failed it. Use it when play lands on a beat without taking a listed " +
        "route, or when a beat is lost (failed: true). Only the thread's current beat or one a route leads to; to get " +
        "further, mark the routes one at a time." + NOTE,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        quest_id: idProp("The quest's id"),
        thread_id: idProp("The thread's id"),
        beat_id: idProp("The beat's id"),
        failed: { type: "boolean", description: "True when the party failed this beat instead of reaching it." },
      },
      required: ["quest_id", "thread_id", "beat_id"],
    },
  },
  {
    name: QUEST_OBJECTIVE_TOOL,
    description:
      "An objective of a quest is under way (pending), met (complete) or lost (failed). Mark it when play settles it, " +
        "never earlier. It cannot be undone, and it fires whatever depends on it." + NOTE,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        objective_id: idProp("The objective's id"),
        status: { type: "string", enum: ["pending", "complete", "failed"] },
        reason: reasonProp,
      },
      required: ["objective_id", "status", "reason"],
    },
  },
  {
    name: QUEST_CLOCK_TOOL,
    description:
      "Moves a quest's clock forward because of something that happened in play. Only forward, by 1 to " +
        `${CLOCK_STEP_MAX} segments (default 1). Never use it to pass a turn: the pressure clock is advanced by the ` +
        "server. When it fills, what it counts down to fires, and that cannot be undone." + NOTE,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        clock_id: idProp("The clock's id"),
        step: { type: "integer", minimum: 1, maximum: CLOCK_STEP_MAX },
        reason: reasonProp,
      },
      required: ["clock_id", "reason"],
    },
  },
  {
    name: PRESSURE_TOOL,
    description:
      "Puts the scene under time pressure, for a scene where time matters: a chase, a guard returning, a ritual. " +
        "From then on the server advances the clock by one at the end of every turn, and you are told each turn where " +
        "it stands and when this turn fills it. Give exactly one of: clock_id (run against a clock listed under " +
        "\"Quests in play\"); quest_id with label and segments (start a new clock on that quest and run against it); " +
        "or stop: true. Stop only when what it counts down to can no longer happen (the party left, the danger is dealt " +
        "with), never because a turn passed; left running after that, the clock keeps counting through the next scene." + NOTE,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        clock_id: idProp("The clock's id"),
        quest_id: idProp("The quest to start a new clock on"),
        label: { type: "string", minLength: 1, maxLength: CLOCK_LABEL_MAX, description: "What the clock counts down to, in a few words." },
        segments: { type: "integer", minimum: 2, maximum: 12, description: "How many turns of pressure before it happens." },
        stop: { type: "boolean", description: "True to end the pressure." },
      },
    },
  },
];

// --- parsing --------------------------------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(input: Record<string, unknown>, key: string): Parsed<string> {
  const v = input[key];
  if (typeof v !== "string" || !UUID.test(v.trim())) {
    return { ok: false, error: `${key} must be an id exactly as listed under "Quests in play".` };
  }
  return { ok: true, value: v.trim().toLowerCase() };
}

function reasonOf(input: Record<string, unknown>): Parsed<string> {
  const v = input.reason;
  if (typeof v !== "string" || v.trim() === "") return { ok: false, error: "reason is required: one short sentence of why." };
  const r = v.trim();
  if (r.length > REASON_MAX) return { ok: false, error: `reason is ${r.length} characters; keep it to at most ${REASON_MAX}.` };
  return { ok: true, value: r };
}

export interface RouteInput { questId: string; threadId: string; edgeId: string }
export interface BeatInput { questId: string; threadId: string; beatId: string; failed: boolean }
export interface ObjectiveInput { objectiveId: string; status: "pending" | "complete" | "failed"; reason: string }
export interface ClockInput { clockId: string; step: number; reason: string }
export type PressureInput =
  | { mode: "run"; clockId: string }
  | { mode: "start"; questId: string; label: string; segments: number }
  | { mode: "stop" };

export function parseRouteInput(input: Record<string, unknown>): Parsed<RouteInput> {
  const quest = idOf(input, "quest_id");
  if (!quest.ok) return quest;
  const thread = idOf(input, "thread_id");
  if (!thread.ok) return thread;
  const edge = idOf(input, "edge_id");
  if (!edge.ok) return edge;
  return { ok: true, value: { questId: quest.value, threadId: thread.value, edgeId: edge.value } };
}

export function parseBeatInput(input: Record<string, unknown>): Parsed<BeatInput> {
  const quest = idOf(input, "quest_id");
  if (!quest.ok) return quest;
  const thread = idOf(input, "thread_id");
  if (!thread.ok) return thread;
  const beat = idOf(input, "beat_id");
  if (!beat.ok) return beat;
  if (input.failed !== undefined && typeof input.failed !== "boolean") return { ok: false, error: "failed must be true or false." };
  return { ok: true, value: { questId: quest.value, threadId: thread.value, beatId: beat.value, failed: input.failed === true } };
}

export function parseObjectiveInput(input: Record<string, unknown>): Parsed<ObjectiveInput> {
  const objective = idOf(input, "objective_id");
  if (!objective.ok) return objective;
  const status = input.status;
  if (status !== "pending" && status !== "complete" && status !== "failed") {
    return { ok: false, error: "status must be pending, complete or failed." };
  }
  const reason = reasonOf(input);
  if (!reason.ok) return reason;
  return { ok: true, value: { objectiveId: objective.value, status, reason: reason.value } };
}

export function parseClockInput(input: Record<string, unknown>): Parsed<ClockInput> {
  const clock = idOf(input, "clock_id");
  if (!clock.ok) return clock;
  let step = 1;
  if (input.step !== undefined) {
    const s = input.step;
    if (typeof s !== "number" || !Number.isInteger(s) || s < 1 || s > CLOCK_STEP_MAX) {
      return { ok: false, error: `step must be a whole number from 1 to ${CLOCK_STEP_MAX}: a clock only moves forward.` };
    }
    step = s;
  }
  const reason = reasonOf(input);
  if (!reason.ok) return reason;
  return { ok: true, value: { clockId: clock.value, step, reason: reason.value } };
}

export function parsePressureInput(input: Record<string, unknown>): Parsed<PressureInput> {
  const stop = input.stop;
  if (stop !== undefined && typeof stop !== "boolean") return { ok: false, error: "stop must be true or false." };
  const wantsStop = stop === true;
  const hasClock = input.clock_id !== undefined;
  const hasNew = input.quest_id !== undefined || input.label !== undefined || input.segments !== undefined;
  if ([wantsStop, hasClock, hasNew].filter(Boolean).length !== 1) {
    return {
      ok: false,
      error: "Give exactly one of: clock_id (an existing clock), quest_id with label and segments (a new clock), or stop: true.",
    };
  }
  if (wantsStop) return { ok: true, value: { mode: "stop" } };
  if (hasClock) {
    const clock = idOf(input, "clock_id");
    return clock.ok ? { ok: true, value: { mode: "run", clockId: clock.value } } : clock;
  }
  const quest = idOf(input, "quest_id");
  if (!quest.ok) return quest;
  const label = input.label;
  if (typeof label !== "string" || label.trim() === "" || label.trim().length > CLOCK_LABEL_MAX) {
    return { ok: false, error: `label is required for a new clock: what it counts down to, at most ${CLOCK_LABEL_MAX} characters.` };
  }
  const segments = input.segments;
  if (typeof segments !== "number" || !Number.isInteger(segments) || segments < 2 || segments > 12) {
    return { ok: false, error: "segments is required for a new clock: a whole number from 2 to 12." };
  }
  return { ok: true, value: { mode: "start", questId: quest.value, label: label.trim(), segments } };
}

// --- planning -------------------------------------------------------------------------------------------------

export type ParsedCall =
  | { tool: typeof QUEST_ROUTE_TOOL; value: RouteInput }
  | { tool: typeof QUEST_BEAT_TOOL; value: BeatInput }
  | { tool: typeof QUEST_OBJECTIVE_TOOL; value: ObjectiveInput }
  | { tool: typeof QUEST_CLOCK_TOOL; value: ClockInput }
  | { tool: typeof PRESSURE_TOOL; value: PressureInput };

export type Planned = { ok: true; move: QuestMove; says: string } | { ok: false; error: string };

const refuse = (error: string): Planned => ({ ok: false, error });
const NOT_LISTED = (what: string) => `That ${what} is not listed under "Quests in play" this turn, so nothing was changed. Use an id exactly as listed.`;

function findThread(shown: Shown, questId: string, threadId: string): ShownThread | "no-quest" | "no-thread" {
  const quest = shown.quests.find((q) => q.questId === questId);
  if (!quest) return "no-quest";
  return quest.threads.find((t) => t.threadId === threadId) ?? "no-thread";
}

function threadOrError(shown: Shown, questId: string, threadId: string): { thread: ShownThread } | { error: Planned } {
  const found = findThread(shown, questId, threadId);
  if (found === "no-quest") return { error: refuse(NOT_LISTED("quest")) };
  if (found === "no-thread") return { error: refuse(NOT_LISTED("thread") + " Check that the thread belongs to that quest.") };
  return { thread: found };
}

export function planQuestMove(state: QuestsInPlay, queued: readonly QuestMove[], call: ParsedCall): Planned {
  const shown = shownOf(state);
  switch (call.tool) {
    case QUEST_ROUTE_TOOL: {
      const found = threadOrError(shown, call.value.questId, call.value.threadId);
      if ("error" in found) return found.error;
      const route = found.thread.routes.find((r) => r.edgeId === call.value.edgeId);
      if (!route) return refuse(NOT_LISTED("route") + " Only the routes out of the thread's current beat can be taken.");
      if (!route.open) {
        return refuse(
          `That route is closed: its condition is not met, so the party cannot take it yet. If play really got them ` +
            `through anyway, mark the beat "${route.toBeatTitle}" as reached with quest_beat (beat id ${route.toBeatId}) instead.`,
        );
      }
      const how = route.label ? `the route "${route.label}"` : "that route";
      return {
        ok: true,
        move: { kind: "route", questId: call.value.questId, threadId: call.value.threadId, edgeId: route.edgeId },
        says: `When the turn is kept, the party takes ${how} to "${route.toBeatTitle}".`,
      };
    }
    case QUEST_BEAT_TOOL: {
      const found = threadOrError(shown, call.value.questId, call.value.threadId);
      if ("error" in found) return found.error;
      const t = found.thread;
      const here = t.beat !== null && t.beat.id === call.value.beatId ? t.beat.title : null;
      const ahead = t.routes.find((r) => r.toBeatId === call.value.beatId);
      const title = here ?? (ahead ? ahead.toBeatTitle : null);
      if (title === null) {
        return refuse(
          "That beat is neither the thread's current beat nor one a route leads to, so nothing was changed. To get " +
            "further, mark the routes one at a time.",
        );
      }
      return {
        ok: true,
        move: { kind: "beat", questId: call.value.questId, threadId: call.value.threadId, beatId: call.value.beatId, failed: call.value.failed },
        says: call.value.failed
          ? `When the turn is kept, the beat "${title}" is marked as failed.`
          : `When the turn is kept, the party is marked as being at the beat "${title}".`,
      };
    }
    case QUEST_OBJECTIVE_TOOL: {
      const objective = shown.quests.flatMap((q) => q.objectives).find((o) => o.id === call.value.objectiveId);
      if (!objective) return refuse(NOT_LISTED("objective") + " Objectives not yet raised are not listed and cannot be marked.");
      let current: ObjectiveStatus = objective.status;
      for (const m of queued) if (m.kind === "objective" && m.objectiveId === objective.id) current = m.status;
      if (current === call.value.status) return refuse(`That objective is already ${current}, so nothing was changed.`);
      return {
        ok: true,
        move: { kind: "objective", objectiveId: objective.id, status: call.value.status, reason: call.value.reason },
        says: `When the turn is kept, the objective "${objective.description}" is marked ${call.value.status}.`,
      };
    }
    case QUEST_CLOCK_TOOL: {
      const clock = shownClock(state, shown, call.value.clockId);
      if (!clock) return refuse(NOT_LISTED("clock"));
      const before = clockAfterQueued(clock, call.value.clockId, queued);
      if (before >= clock.segments) return refuse(`The clock "${clock.label}" is already full, so nothing was changed.`);
      const after = Math.min(clock.segments, before + call.value.step);
      const fills = after >= clock.segments
        ? ` It fills: what "${clock.label}" counts down to happens now, in this reply.`
        : "";
      return {
        ok: true,
        move: { kind: "clock", clockId: call.value.clockId, step: call.value.step, reason: call.value.reason },
        says: `When the turn is kept, the clock "${clock.label}" moves to ${after} of ${clock.segments}.${fills}`,
      };
    }
    case PRESSURE_TOOL: {
      const v = call.value;
      if (v.mode === "stop") {
        return { ok: true, move: { kind: "pressure", mode: "stop" }, says: "When the turn is kept, the scene is no longer under time pressure." };
      }
      if (v.mode === "run") {
        const clock = shownClock(state, shown, v.clockId);
        if (!clock) return refuse(NOT_LISTED("clock"));
        return {
          ok: true,
          move: { kind: "pressure", mode: "run", clockId: v.clockId },
          says: `When the turn is kept, the scene runs against the clock "${clock.label}", which the server advances by one every turn from the next.`,
        };
      }
      if (!shown.quests.some((q) => q.questId === v.questId)) return refuse(NOT_LISTED("quest"));
      return {
        ok: true,
        move: { kind: "pressure", mode: "start", questId: v.questId, label: v.label, segments: v.segments },
        says: `When the turn is kept, a clock "${v.label}" of ${v.segments} segments starts on that quest and the scene runs against it, advanced by one every turn from the next.`,
      };
    }
  }
}

/** Where the clock stands once the ticks already queued this turn are counted. */
function clockAfterQueued(clock: { filled: number; segments: number }, clockId: string, queued: readonly QuestMove[]): number {
  let filled = clock.filled;
  for (const m of queued) if (m.kind === "clock" && m.clockId === clockId) filled = Math.min(clock.segments, filled + m.step);
  return filled;
}

// --- the tools of one turn ------------------------------------------------------------------------------------

export interface QuestToolsDeps {
  state: QuestsInPlay;
  /** The turn's own list, owned by the caller: the handler applies it once the turn is kept. */
  queued: QuestMove[];
}

export function makeQuestTools(deps: QuestToolsDeps): {
  tools: AgentTool[];
  names: ReadonlySet<string>;
  call(name: string, input: Record<string, unknown>): Promise<ToolAnswer>;
} {
  const names: ReadonlySet<string> = new Set(QUEST_TOOLS.map((t) => t.name));

  const parse = (name: string, input: Record<string, unknown>): Parsed<ParsedCall> => {
    switch (name) {
      case QUEST_ROUTE_TOOL: {
        const p = parseRouteInput(input);
        return p.ok ? { ok: true, value: { tool: QUEST_ROUTE_TOOL, value: p.value } } : p;
      }
      case QUEST_BEAT_TOOL: {
        const p = parseBeatInput(input);
        return p.ok ? { ok: true, value: { tool: QUEST_BEAT_TOOL, value: p.value } } : p;
      }
      case QUEST_OBJECTIVE_TOOL: {
        const p = parseObjectiveInput(input);
        return p.ok ? { ok: true, value: { tool: QUEST_OBJECTIVE_TOOL, value: p.value } } : p;
      }
      case QUEST_CLOCK_TOOL: {
        const p = parseClockInput(input);
        return p.ok ? { ok: true, value: { tool: QUEST_CLOCK_TOOL, value: p.value } } : p;
      }
      case PRESSURE_TOOL: {
        const p = parsePressureInput(input);
        return p.ok ? { ok: true, value: { tool: PRESSURE_TOOL, value: p.value } } : p;
      }
      default:
        return { ok: false, error: `Unknown quest tool ${name}.` };
    }
  };

  return {
    tools: QUEST_TOOLS,
    names,
    call: async (name, input) => {
      const parsed = parse(name, input);
      if (!parsed.ok) return { content: parsed.error, isError: true };
      const planned = planQuestMove(deps.state, deps.queued, parsed.value);
      if (!planned.ok) return { content: planned.error, isError: true };
      deps.queued.push(planned.move);
      return { content: planned.says, isError: false };
    },
  };
}

// --- time -----------------------------------------------------------------------------------------------------

/**
 * The server's own tick for a kept turn. None when the scene is under no pressure, when the narrator changed or
 * stopped the pressure this turn (a clock that was just started has had no turn yet), or when it already moved that
 * clock itself this turn: the turn must not count twice.
 */
export function pressureTick(state: QuestsInPlay, queued: readonly QuestMove[]): QuestMove | null {
  const p = state.pressure;
  if (p === null) return null;
  for (const m of queued) {
    if (m.kind === "pressure" && !(m.mode === "run" && m.clockId === p.clockId)) return null;
    if (m.kind === "clock" && m.clockId === p.clockId) return null;
  }
  return { kind: "clock", clockId: p.clockId, step: 1, reason: "a turn passed" };
}

/**
 * What the player's screen shows of the pressure once this turn is kept: how full the clock is, never what it counts
 * down to (the label is the narrator's own note and may name what is coming). Worked out from the state the turn
 * started with and the moves it queued, the same way the tools answered, so the page does not wait for a re-read.
 * Null when the scene is under no pressure after this turn.
 */
export function pressureShown(state: QuestsInPlay, queued: readonly QuestMove[]): { filled: number; segments: number } | null {
  const ticked = new Map<string, number>();
  let current: { clockId: string | null; filled: number; segments: number } | null =
    state.pressure === null ? null : { clockId: state.pressure.clockId, filled: state.pressure.filled, segments: state.pressure.segments };
  for (const m of queued) {
    if (m.kind === "clock") ticked.set(m.clockId, (ticked.get(m.clockId) ?? 0) + m.step);
    if (m.kind !== "pressure") continue;
    if (m.mode === "stop") current = null;
    else if (m.mode === "start") current = { clockId: null, filled: 0, segments: m.segments };
    else {
      const clock = state.pressure?.clockId === m.clockId ? state.pressure : state.threads.flatMap((t) => t.clocks).find((c) => c.id === m.clockId);
      // A clock the turn was never shown cannot be queued (the tool refuses it), so there is nothing to show for one.
      current = clock ? { clockId: m.clockId, filled: clock.filled, segments: clock.segments } : null;
    }
  }
  if (current === null) return null;
  const own = current.clockId === null ? 0 : (ticked.get(current.clockId) ?? 0);
  const server = pressureTick(state, queued) === null ? 0 : 1;
  return { filled: Math.min(current.segments, current.filled + own + server), segments: current.segments };
}
