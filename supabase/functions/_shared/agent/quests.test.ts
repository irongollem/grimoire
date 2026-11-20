import { describe, expect, it } from "vitest";
import {
  makeQuestTools,
  MAX_CLOCKS,
  MAX_OBJECTIVES,
  MAX_PAYOFFS,
  MAX_ROUTES,
  MAX_THREADS,
  NO_QUESTS,
  parseClockInput,
  parsePressureInput,
  pressureIsSpent,
  pressureShown,
  pressureTick,
  questsSection,
  payoffWords,
  type QuestMove,
  type QuestPayoff,
  type QuestRoute,
  type QuestsInPlay,
  type QuestThread,
} from "./quests";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const QUEST = id(1);
const OTHER_QUEST = id(2);
const THREAD = id(10);
const OTHER_THREAD = id(11);
const E_OPEN = id(20);
const E_CLOSED = id(21);
const E_PARALLEL = id(22);
const B_HERE = id(30);
const B_NEXT = id(31);
const B_LOCKED = id(32);
const B_SIDE = id(33);
const B_FAR = id(34);
const O_PENDING = id(40);
const O_DORMANT = id(41);
const O_DONE = id(42);
const CLOCK = id(50);
const PRESSURE = id(51);

const route = (edgeId: string, toBeatId: string, over: Partial<QuestRoute> = {}): QuestRoute => ({
  edgeId,
  label: null,
  toBeatId,
  toBeatTitle: `Beat ${toBeatId.slice(-2)}`,
  kind: "choice",
  open: true,
  ...over,
});

function thread(over: Partial<QuestThread> = {}): QuestThread {
  return {
    questId: QUEST,
    questTitle: "The Drowned Bell",
    threadId: THREAD,
    threadLabel: "Main road",
    beat: { id: B_HERE, title: "The flooded crypt" },
    routes: [
      route(E_OPEN, B_NEXT, { label: "Swim the channel", toBeatTitle: "The bell room" }),
      route(E_CLOSED, B_LOCKED, { open: false, toBeatTitle: "The vault" }),
      route(E_PARALLEL, B_SIDE, { kind: "parallel", toBeatTitle: "The rising tide" }),
    ],
    objectives: [
      { id: O_PENDING, description: "Find the bell", status: "pending" },
      { id: O_DORMANT, description: "DORMANT-MARK not raised", status: "dormant" },
      { id: O_DONE, description: "Enter the crypt", status: "complete" },
    ],
    clocks: [{ id: CLOCK, label: "Tide", filled: 2, segments: 4 }],
    held: [],
    delayed: [],
    ...over,
  };
}

function state(over: Partial<QuestsInPlay> = {}): QuestsInPlay {
  return { threads: [thread()], pressure: null, ...over };
}

const pressure = (filled: number, segments = 4) => ({ clockId: PRESSURE, label: "FLOOD-MARK", filled, segments });

function tools(s: QuestsInPlay, queued: QuestMove[] = []) {
  return { queued, t: makeQuestTools({ state: s, queued }) };
}

describe("questsSection", () => {
  it("says no quest is under way instead of printing an empty list", () => {
    const text = questsSection(NO_QUESTS);
    expect(text).toMatch(/^## Quests in play/);
    expect(text).toContain("No quest is under way");
  });

  it("lists each route with its id and where it leads, and marks only the closed one", () => {
    const text = questsSection(state());
    expect(text).toContain(`Route id ${E_OPEN}: "Swim the channel", leads to "The bell room"`);
    const closedLine = text.split("\n").find((l) => l.includes(E_CLOSED))!;
    const openLine = text.split("\n").find((l) => l.includes(E_OPEN))!;
    expect(closedLine).toContain("[closed]");
    expect(openLine).not.toContain("[closed]");
  });

  it("leaves a dormant objective out, since it is not raised yet, and shows the others with their status", () => {
    const text = questsSection(state());
    expect(text).not.toContain("DORMANT-MARK");
    expect(text).toContain(`id ${O_PENDING} [pending]: Find the bell`);
    expect(text).toContain(`id ${O_DONE} [complete]`);
  });

  it("shows a clock as filled of segments", () => {
    expect(questsSection(state())).toContain(`id ${CLOCK}: Tide, 2 of 4`);
  });

  it("prints a quest once when it has two threads", () => {
    const text = questsSection(state({ threads: [thread(), thread({ threadId: OTHER_THREAD, threadLabel: "Back way" })] }));
    expect(text.split("The Drowned Bell").length - 1).toBe(1);
    expect(text).toContain(`id ${OTHER_THREAD}`);
  });

  it("cuts threads, routes, objectives and clocks at their limits and says how many are left", () => {
    const many = Array.from({ length: MAX_THREADS + 2 }, (_, i) =>
      thread({ questId: id(100 + i), threadId: id(200 + i), questTitle: `Quest ${i}` }));
    expect(questsSection({ threads: many, pressure: null })).toContain("and 2 more threads");

    const crowded = thread({
      routes: Array.from({ length: MAX_ROUTES + 3 }, (_, i) => route(id(300 + i), id(400 + i))),
      objectives: Array.from({ length: MAX_OBJECTIVES + 4 }, (_, i) => ({ id: id(500 + i), description: `O${i}`, status: "pending" as const })),
      clocks: Array.from({ length: MAX_CLOCKS + 1 }, (_, i) => ({ id: id(600 + i), label: `C${i}`, filled: 0, segments: 4 })),
    });
    const text = questsSection(state({ threads: [crowded] }));
    expect(text).toContain("and 3 more routes");
    expect(text).toContain("and 4 more objectives");
    expect(text).toContain("and 1 more clocks");
  });

  it("says the clock fills this turn exactly when one more tick fills it, and not a turn earlier", () => {
    const fills = (filled: number, segments = 4) => /fills/.test(questsSection(state({ pressure: pressure(filled, segments) })));
    expect(fills(2)).toBe(false);
    expect(fills(3)).toBe(true);
    expect(fills(1, 2)).toBe(true);
    expect(fills(0, 2)).toBe(false);
  });

  it("names the pressure clock and where it stands even when its quest is no longer live", () => {
    const text = questsSection({ threads: [], pressure: pressure(2) });
    expect(text).toContain("No quest is under way");
    expect(text).toContain(`FLOOD-MARK" (clock id ${PRESSURE}), at 2 of 4`);
  });

  it("shows no pressure block when nothing is running against a clock", () => {
    expect(questsSection(state())).not.toContain("Pressure");
  });
});

describe("quest tools refuse an id the narrator was not shown", () => {
  const unknown = id(999);
  const refused = async (name: string, input: Record<string, unknown>, s: QuestsInPlay = state()) => {
    const { t, queued } = tools(s);
    const answer = await t.call(name, input);
    expect(answer.isError).toBe(true);
    expect(queued).toEqual([]);
    return answer.content;
  };

  it("quest_route: an unknown edge", async () => {
    await refused("quest_route", { quest_id: QUEST, thread_id: THREAD, edge_id: unknown });
  });
  it("quest_route: an unknown quest", async () => {
    await refused("quest_route", { quest_id: unknown, thread_id: THREAD, edge_id: E_OPEN });
  });
  it("quest_route: a thread that belongs to a different quest", async () => {
    const s = state({ threads: [thread(), thread({ questId: OTHER_QUEST, threadId: OTHER_THREAD })] });
    await refused("quest_route", { quest_id: QUEST, thread_id: OTHER_THREAD, edge_id: E_OPEN }, s);
  });
  it("quest_route: an edge that leads out of another thread's beat", async () => {
    const otherEdge = id(23);
    const s = state({ threads: [thread(), thread({ threadId: OTHER_THREAD, routes: [route(otherEdge, B_FAR)] })] });
    await refused("quest_route", { quest_id: QUEST, thread_id: THREAD, edge_id: otherEdge }, s);
  });
  it("quest_beat: an unknown beat", async () => {
    await refused("quest_beat", { quest_id: QUEST, thread_id: THREAD, beat_id: unknown });
  });
  it("quest_objective: an unknown objective", async () => {
    await refused("quest_objective", { objective_id: unknown, status: "complete", reason: "x" });
  });
  it("quest_objective: a dormant one, which is not shown", async () => {
    await refused("quest_objective", { objective_id: O_DORMANT, status: "complete", reason: "x" });
  });
  it("quest_clock: an unknown clock", async () => {
    await refused("quest_clock", { clock_id: unknown, reason: "x" });
  });
  it("pressure: an unknown clock", async () => {
    await refused("pressure", { clock_id: unknown });
  });
  it("pressure: a new clock on an unknown quest", async () => {
    await refused("pressure", { quest_id: unknown, label: "Chase", segments: 4 });
  });
  it("a thread beyond the eighth, which is not shown", async () => {
    const many = Array.from({ length: MAX_THREADS + 1 }, (_, i) =>
      thread({ questId: id(100 + i), threadId: id(200 + i), routes: [route(E_OPEN, B_NEXT)] }));
    await refused("quest_route", { quest_id: id(100 + MAX_THREADS), thread_id: id(200 + MAX_THREADS), edge_id: E_OPEN }, { threads: many, pressure: null });
  });
  it("an objective beyond the twelfth, which is not shown", async () => {
    const objectives = Array.from({ length: MAX_OBJECTIVES + 1 }, (_, i) => ({ id: id(500 + i), description: `O${i}`, status: "pending" as const }));
    await refused("quest_objective", { objective_id: id(500 + MAX_OBJECTIVES), status: "complete", reason: "x" }, state({ threads: [thread({ objectives })] }));
  });
  it("the pressure clock is a clock the narrator was shown, even when its quest is no longer listed, so it may be ticked", async () => {
    const { t, queued } = tools(state({ pressure: pressure(1) }));
    const answer = await t.call("quest_clock", { clock_id: PRESSURE, reason: "the horn sounds" });
    expect(answer.isError).toBe(false);
    expect(queued).toEqual([{ kind: "clock", clockId: PRESSURE, step: 1, reason: "the horn sounds" }]);
  });
  it("ignores a campaign_id the model writes: no move carries one", async () => {
    const { t, queued } = tools(state());
    await t.call("quest_route", { quest_id: QUEST, thread_id: THREAD, edge_id: E_OPEN, campaign_id: unknown });
    expect(JSON.stringify(queued)).not.toContain(unknown);
  });
});

describe("routes and beats", () => {
  it("queues an open route and says where it leads, without writing anything itself", async () => {
    const { t, queued } = tools(state());
    const answer = await t.call("quest_route", { quest_id: QUEST, thread_id: THREAD, edge_id: E_OPEN });
    expect(answer.isError).toBe(false);
    expect(answer.content).toContain("Swim the channel");
    expect(answer.content).toContain("The bell room");
    expect(queued).toEqual([{ kind: "route", questId: QUEST, threadId: THREAD, edgeId: E_OPEN }]);
  });

  it("refuses a closed route and names the beat to mark instead, which is the screen's own override", async () => {
    const { t, queued } = tools(state());
    const answer = await t.call("quest_route", { quest_id: QUEST, thread_id: THREAD, edge_id: E_CLOSED });
    expect(answer.isError).toBe(true);
    expect(answer.content).toContain("quest_beat");
    expect(answer.content).toContain(B_LOCKED);
    expect(queued).toEqual([]);
  });

  it("lets the party be marked at the beat behind a closed route, which is how a closed gate is overridden", async () => {
    const { t, queued } = tools(state());
    const answer = await t.call("quest_beat", { quest_id: QUEST, thread_id: THREAD, beat_id: B_LOCKED });
    expect(answer.isError).toBe(false);
    expect(queued).toEqual([{ kind: "beat", questId: QUEST, threadId: THREAD, beatId: B_LOCKED, failed: false }]);
  });

  it("refuses a beat that is neither here nor one route away, and says to mark the routes one at a time", async () => {
    const { t, queued } = tools(state());
    const answer = await t.call("quest_beat", { quest_id: QUEST, thread_id: THREAD, beat_id: B_FAR });
    expect(answer.isError).toBe(true);
    expect(answer.content).toContain("one at a time");
    expect(queued).toEqual([]);
  });

  it("accepts the thread's current beat, and keeps failed apart from reached", async () => {
    const { t, queued } = tools(state());
    await t.call("quest_beat", { quest_id: QUEST, thread_id: THREAD, beat_id: B_HERE, failed: true });
    await t.call("quest_beat", { quest_id: QUEST, thread_id: THREAD, beat_id: B_HERE });
    expect(queued).toMatchObject([{ failed: true }, { failed: false }]);
  });

  it("rejects a failed flag that is not a boolean instead of reading it as true", async () => {
    const { t, queued } = tools(state());
    const answer = await t.call("quest_beat", { quest_id: QUEST, thread_id: THREAD, beat_id: B_HERE, failed: "false" });
    expect(answer.isError).toBe(true);
    expect(queued).toEqual([]);
  });
});

describe("objectives", () => {
  it("refuses to mark an objective with the status it already has", async () => {
    const { t, queued } = tools(state());
    const answer = await t.call("quest_objective", { objective_id: O_DONE, status: "complete", reason: "again" });
    expect(answer.isError).toBe(true);
    expect(queued).toEqual([]);
  });

  it("counts an objective already marked this turn, so the same mark is not queued twice", async () => {
    const { t, queued } = tools(state());
    await t.call("quest_objective", { objective_id: O_PENDING, status: "complete", reason: "found it" });
    const second = await t.call("quest_objective", { objective_id: O_PENDING, status: "complete", reason: "found it" });
    expect(second.isError).toBe(true);
    expect(queued).toHaveLength(1);
  });

  it("refuses a status the database does not have, and a missing or over-long reason", async () => {
    const { t, queued } = tools(state());
    expect((await t.call("quest_objective", { objective_id: O_PENDING, status: "dormant", reason: "x" })).isError).toBe(true);
    expect((await t.call("quest_objective", { objective_id: O_PENDING, status: "complete" })).isError).toBe(true);
    expect((await t.call("quest_objective", { objective_id: O_PENDING, status: "complete", reason: "x".repeat(201) })).isError).toBe(true);
    expect(queued).toEqual([]);
  });
});

describe("clocks", () => {
  it("adds up two ticks of one clock in what the second answer says, and says it fills when it does", async () => {
    const { t, queued } = tools(state());
    const first = await t.call("quest_clock", { clock_id: CLOCK, reason: "noise" });
    const second = await t.call("quest_clock", { clock_id: CLOCK, reason: "more noise" });
    expect(first.content).toContain("3 of 4");
    expect(first.content).not.toMatch(/fills/);
    expect(second.content).toContain("4 of 4");
    expect(second.content).toMatch(/fills/);
    expect(queued).toHaveLength(2);
  });

  it("refuses a tick of a clock that earlier ticks this turn already filled", async () => {
    const { t, queued } = tools(state());
    await t.call("quest_clock", { clock_id: CLOCK, step: 2, reason: "a" });
    const again = await t.call("quest_clock", { clock_id: CLOCK, reason: "b" });
    expect(again.isError).toBe(true);
    expect(queued).toHaveLength(1);
  });

  it("never reports a clock past its last segment", async () => {
    const { t } = tools(state());
    const answer = await t.call("quest_clock", { clock_id: CLOCK, step: 4, reason: "x" });
    expect(answer.content).toContain("4 of 4");
  });

  it("only moves forward: step 0, a negative, a fraction and more than the cap are refused", () => {
    for (const step of [0, -1, 1.5, 5, "2"]) {
      expect(parseClockInput({ clock_id: CLOCK, step, reason: "x" }).ok).toBe(false);
    }
    expect(parseClockInput({ clock_id: CLOCK, reason: "x" })).toMatchObject({ ok: true, value: { step: 1 } });
  });
});

describe("pressure", () => {
  it("takes exactly one of the three forms", () => {
    expect(parsePressureInput({}).ok).toBe(false);
    expect(parsePressureInput({ stop: true, clock_id: PRESSURE }).ok).toBe(false);
    expect(parsePressureInput({ clock_id: PRESSURE, quest_id: QUEST, label: "x", segments: 3 }).ok).toBe(false);
    expect(parsePressureInput({ stop: false }).ok).toBe(false);
  });

  it("refuses a new clock with a label that is blank or too long, or segments outside 2 to 12", () => {
    const base = { quest_id: QUEST, label: "Guard returns", segments: 4 };
    expect(parsePressureInput(base).ok).toBe(true);
    expect(parsePressureInput({ ...base, label: "  " }).ok).toBe(false);
    expect(parsePressureInput({ ...base, label: "x".repeat(81) }).ok).toBe(false);
    expect(parsePressureInput({ ...base, segments: 1 }).ok).toBe(false);
    expect(parsePressureInput({ ...base, segments: 13 }).ok).toBe(false);
    expect(parsePressureInput({ ...base, segments: 2.5 }).ok).toBe(false);
  });

  it("queues a new clock on a quest that is shown", async () => {
    const { t, queued } = tools(state());
    const answer = await t.call("pressure", { quest_id: QUEST, label: "Guard returns", segments: 5 });
    expect(answer.isError).toBe(false);
    expect(queued).toEqual([{ kind: "pressure", mode: "start", questId: QUEST, label: "Guard returns", segments: 5 }]);
  });
});

describe("pressureTick", () => {
  const withPressure = state({ pressure: pressure(1) });
  const tick: QuestMove = { kind: "clock", clockId: PRESSURE, step: 1, reason: "a turn passed" };

  it("ticks the pressure clock once on an ordinary turn", () => {
    expect(pressureTick(withPressure, [])).toEqual(tick);
  });

  it("does nothing when the scene is under no pressure", () => {
    expect(pressureTick(state(), [])).toBeNull();
  });

  it("does not count the turn a second time when the narrator ticked that clock itself", () => {
    expect(pressureTick(withPressure, [{ kind: "clock", clockId: PRESSURE, step: 2, reason: "x" }])).toBeNull();
  });

  it("still ticks the pressure clock when the narrator moved some other clock", () => {
    expect(pressureTick(withPressure, [{ kind: "clock", clockId: CLOCK, step: 1, reason: "x" }])).toEqual(tick);
  });

  it("does not tick on a turn that stops the pressure, or starts a new clock, or runs against another", () => {
    expect(pressureTick(withPressure, [{ kind: "pressure", mode: "stop" }])).toBeNull();
    expect(pressureTick(withPressure, [{ kind: "pressure", mode: "start", questId: QUEST, label: "x", segments: 3 }])).toBeNull();
    expect(pressureTick(withPressure, [{ kind: "pressure", mode: "run", clockId: CLOCK }])).toBeNull();
  });

  it("still ticks when the narrator re-runs the same clock, which changes nothing", () => {
    expect(pressureTick(withPressure, [{ kind: "pressure", mode: "run", clockId: PRESSURE }])).toEqual(tick);
  });
});

describe("pressureShown", () => {
  // pressure(1) is the fixture's clock at 1; its segments come from the fixture.
  const withPressure = state({ pressure: pressure(1) });
  const segments = pressure(1).segments;

  it("shows the server's tick on an ordinary turn, so the page is not one turn behind the clock", () => {
    expect(pressureShown(withPressure, [])).toEqual({ filled: 2, segments });
  });

  it("shows the narrator's own ticks and not the server's on top, so a turn is not counted twice on screen", () => {
    expect(pressureShown(withPressure, [{ kind: "clock", clockId: PRESSURE, step: 2, reason: "x" }])).toEqual({ filled: 3, segments });
  });

  it("never shows a clock fuller than it is long", () => {
    expect(pressureShown(state({ pressure: pressure(segments) }), [])).toEqual({ filled: segments, segments });
  });

  it("shows a clock just started as empty, because it has had no turn yet", () => {
    expect(pressureShown(state(), [{ kind: "pressure", mode: "start", questId: QUEST, label: "Guard returns", segments: 5 }])).toEqual({ filled: 0, segments: 5 });
  });

  it("shows nothing once the pressure is stopped, so a finished chase leaves no clock on the page", () => {
    expect(pressureShown(withPressure, [{ kind: "pressure", mode: "stop" }])).toBeNull();
  });

  it("shows nothing when the scene was and stays under no pressure, whatever other clock moved", () => {
    expect(pressureShown(state(), [{ kind: "clock", clockId: CLOCK, step: 1, reason: "x" }])).toBeNull();
  });

  it("ignores ticks of another clock, so a quest clock moving does not fill the pressure on screen", () => {
    expect(pressureShown(withPressure, [{ kind: "clock", clockId: CLOCK, step: 3, reason: "x" }])).toEqual({ filled: 2, segments });
  });

  it("shows the listed clock a scene is switched to run against, at its own fill", () => {
    // The fixture's "Tide" stands at 2 of 4; a switch has had no turn of its own yet.
    expect(pressureShown(state(), [{ kind: "pressure", mode: "run", clockId: CLOCK }])).toEqual({ filled: 2, segments: 4 });
  });
});

describe("pressure that cannot be misused", () => {
  it("refuses to stop the pressure in the turn that started it, so the danger is not called off before it can arrive", async () => {
    const { t, queued } = tools(state());
    await t.call("pressure", { quest_id: QUEST, label: "Guard returns", segments: 3 });
    const stop = await t.call("pressure", { stop: true });
    expect(stop.isError).toBe(true);
    expect(queued).toHaveLength(1);
  });

  it("still stops a clock that was already running when the turn began", async () => {
    const { t, queued } = tools(state({ pressure: pressure(1) }));
    expect((await t.call("pressure", { stop: true })).isError).toBe(false);
    expect(queued).toEqual([{ kind: "pressure", mode: "stop" }]);
  });

  it("refuses to run against a clock that is already full, and takes one with a segment left", async () => {
    // The fixture's quest clock "Tide" is 2 of 4.
    const full = tools(state({ threads: [{ ...state().threads[0], clocks: [{ id: CLOCK, label: "Tide", filled: 4, segments: 4 }] }] }));
    expect((await full.t.call("pressure", { clock_id: CLOCK })).isError).toBe(true);
    const nearly = tools(state({ threads: [{ ...state().threads[0], clocks: [{ id: CLOCK, label: "Tide", filled: 3, segments: 4 }] }] }));
    expect((await nearly.t.call("pressure", { clock_id: CLOCK })).isError).toBe(false);
  });
});

describe("pressureIsSpent", () => {
  it("is spent when the server's tick fills the clock, and not one turn earlier", () => {
    expect(pressureIsSpent(state({ pressure: pressure(3) }), [])).toBe(true);
    expect(pressureIsSpent(state({ pressure: pressure(2) }), [])).toBe(false);
  });

  it("counts the narrator's own ticks instead of the server's", () => {
    expect(pressureIsSpent(state({ pressure: pressure(1) }), [{ kind: "clock", clockId: PRESSURE, step: 3, reason: "x" }])).toBe(true);
    expect(pressureIsSpent(state({ pressure: pressure(1) }), [{ kind: "clock", clockId: PRESSURE, step: 2, reason: "x" }])).toBe(false);
  });

  it("is not spent on a turn that changed the pressure, or a clock just started would be ended by the old one's fill", () => {
    const started: QuestMove = { kind: "pressure", mode: "start", questId: QUEST, label: "Guard returns", segments: 3 };
    expect(pressureIsSpent(state({ pressure: pressure(3) }), [started])).toBe(false);
  });

  it("is not spent at a table under no pressure, or by another clock filling", () => {
    expect(pressureIsSpent(state(), [{ kind: "clock", clockId: CLOCK, step: 4, reason: "x" }])).toBe(false);
    expect(pressureIsSpent(state({ pressure: pressure(1) }), [{ kind: "clock", clockId: CLOCK, step: 4, reason: "x" }])).toBe(false);
  });
});

describe("running against the clock the scene already has", () => {
  it("refuses the repeat and queues nothing, so the narrator is told there is nothing to do", async () => {
    const { t, queued } = tools(state({ pressure: pressure(1) }));
    expect((await t.call("pressure", { clock_id: PRESSURE })).isError).toBe(true);
    expect(queued).toEqual([]);
  });
});

const payoff = (over: Partial<QuestPayoff> = {}): QuestPayoff => ({
  eventId: id(90),
  action: "raise",
  subject: null,
  place: null,
  text: null,
  step: null,
  to: null,
  atBeat: null,
  due: null,
  ...over,
});

describe("payoffs in the quests section", () => {
  // Bug caught: a held payoff was dropped on the way to the narrator, so it never knew a payoff was waiting to be fired
  // and the next tool had no id to name.
  it("lists a held payoff with its event id and what it does, under its quest", () => {
    const held = payoff({ eventId: id(91), action: "send_broadcast", text: "The bell tolls.", atBeat: "The bell room" });
    const text = questsSection(state({ threads: [thread({ held: [held] })] }));
    expect(text).toContain(`event id ${id(91)}: sends the party a message: "The bell tolls.", held at beat "The bell room"`);
    expect(text.indexOf("Held back")).toBeGreaterThan(text.indexOf("Clocks:"));
  });

  it("lists a delayed payoff with its due day, and says nothing about either when there are none", () => {
    const delayed = payoff({ eventId: id(92), action: "tick_clock", subject: "Tide", step: 2, due: "9 Marpenoth, 1492 DR" });
    expect(questsSection(state({ threads: [thread({ delayed: [delayed] })] }))).toContain(
      `event id ${id(92)}: ticks the clock "Tide" by 2, due 9 Marpenoth, 1492 DR`,
    );
    const none = questsSection(state());
    expect(none).not.toContain("Held back");
    expect(none).not.toContain("Delayed");
  });

  // Bug caught: a quest with dozens of held payoffs filled every turn's state.
  it("shows at most MAX_PAYOFFS of each and says how many more there are", () => {
    const many = Array.from({ length: MAX_PAYOFFS + 3 }, (_, i) => payoff({ eventId: id(100 + i) }));
    const text = questsSection(state({ threads: [thread({ held: many })] }));
    expect(text).toContain(`event id ${id(100 + MAX_PAYOFFS - 1)}`);
    expect(text).not.toContain(`event id ${id(100 + MAX_PAYOFFS)}`);
    expect(text).toContain("and 3 more held payoffs.");
  });

  it("does not repeat a quest's payoffs for each of its threads", () => {
    const held = payoff({ eventId: id(93) });
    const second = thread({ threadId: OTHER_THREAD, held: [held] });
    const text = questsSection(state({ threads: [thread({ held: [held] }), second] }));
    expect(text.split(`event id ${id(93)}`)).toHaveLength(2);
  });
});

describe("payoffWords", () => {
  it("words each verb by what it does, naming what it acts on", () => {
    expect(payoffWords(payoff({ action: "complete", subject: "Find the bell" }))).toBe('completes the objective "Find the bell"');
    expect(payoffWords(payoff({ action: "move_npc", subject: "Maren", place: "the Cellar" }))).toBe("moves Maren to the Cellar");
    expect(payoffWords(payoff({ action: "shift_npc_relationship", subject: "Maren", to: "helpful" }))).toBe("Maren comes to feel helpful toward the party");
    expect(payoffWords(payoff({ action: "shift_npc_relationship", subject: "Maren", step: -1 }))).toBe("shifts how Maren feels about the party (colder by 1)");
  });

  it("falls back to general words when the name could not be found, and never prints null", () => {
    for (const action of ["raise", "tick_clock", "move_npc", "owe_favor", "unlock_quest", "shift_faction_standing", "add_companion"]) {
      expect(payoffWords(payoff({ action }))).not.toMatch(/null|undefined/);
    }
    expect(payoffWords(payoff({ action: "raise" }))).toBe("raises an objective");
  });
});
