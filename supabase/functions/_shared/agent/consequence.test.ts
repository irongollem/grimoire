import { describe, expect, it } from "vitest";
import { parseFireInput, planFire } from "./consequence";
import type { QuestMove, QuestPayoff, QuestsInPlay } from "./quests";

const HELD = "00000000-0000-4000-8000-000000000e01";
const OTHER_HELD = "00000000-0000-4000-8000-000000000e02";
const DELAYED = "00000000-0000-4000-8000-000000000e03";

const payoff = (eventId: string, over: Partial<QuestPayoff> = {}): QuestPayoff => ({
  eventId, action: "complete", subject: "Find the bell", place: null, text: null, step: null, to: null, atBeat: null, due: null, ...over,
});

const state = (held: QuestPayoff[], delayed: QuestPayoff[] = []): QuestsInPlay => ({
  threads: [{
    questId: "q", questTitle: "The drowned bell", threadId: "t", threadLabel: null, beat: null, routes: [], objectives: [], clocks: [],
    held, delayed,
  }],
  pressure: null,
});

describe("parseFireInput", () => {
  // Bug caught: a missing or blank id reaching the planner and being looked up as "".
  it("wants the event id as text", () => {
    expect(parseFireInput({})).toMatchObject({ ok: false });
    expect(parseFireInput({ event_id: "  " })).toMatchObject({ ok: false });
    expect(parseFireInput({ event_id: 4 })).toMatchObject({ ok: false });
    expect(parseFireInput({ event_id: ` ${HELD} ` })).toEqual({ ok: true, value: { eventId: HELD } });
  });
});

describe("planFire", () => {
  // Bug caught: a held payoff answered without saying what will happen, so the Narrator describes the wrong thing.
  it("queues a held payoff and says in plain words what it does when the turn is kept", () => {
    const planned = planFire(state([payoff(HELD)]), [], HELD);
    expect(planned).toEqual({
      ok: true,
      move: { kind: "fire", eventId: HELD },
      says: 'When the turn is kept, the held payoff happens: it completes the objective "Find the bell".',
    });
  });

  // Bug caught: a delayed payoff (it fires on its own day) fired on request, and again on its day.
  it("refuses a delayed payoff and names what can be fired", () => {
    const planned = planFire(state([payoff(HELD)], [payoff(DELAYED, { due: "day 20" })]), [], DELAYED);
    expect(planned).toMatchObject({ ok: false });
    if (planned.ok) return;
    expect(planned.error).toContain("not held back");
    expect(planned.error).toContain("only these can be fired");
    expect(planned.error).toContain(HELD);
  });

  // Bug caught: an invented id performed (or the refusal naming nothing the model could act on).
  it("refuses an unknown id, and says so when nothing at all is held", () => {
    const unknown = planFire(state([payoff(HELD)]), [], "nope");
    expect(unknown).toMatchObject({ ok: false });
    const none = planFire(state([]), [], "nope");
    expect(none).toMatchObject({ ok: false, error: expect.stringContaining("nothing is held back") });
  });

  // Bug caught: firing the same payoff twice in one turn performed it twice; a second, different one is fine.
  it("refuses a second fire of the same payoff, and allows another payoff", () => {
    const queued: QuestMove[] = [{ kind: "fire", eventId: HELD }];
    const s = state([payoff(HELD), payoff(OTHER_HELD)]);
    expect(planFire(s, queued, HELD)).toMatchObject({ ok: false, error: expect.stringContaining("already") });
    expect(planFire(s, queued, OTHER_HELD)).toMatchObject({ ok: true });
  });

  // Bug caught: a payoff listed past the shown limit being fireable though the Narrator was never told its id.
  it("refuses a held payoff the narrator was not shown because the list was cut", () => {
    const many = Array.from({ length: 9 }, (_, i) => payoff(`00000000-0000-4000-8000-00000000f00${i}`));
    expect(planFire(state(many), [], many[8].eventId)).toMatchObject({ ok: false });
    expect(planFire(state(many), [], many[7].eventId)).toMatchObject({ ok: true });
  });
});
