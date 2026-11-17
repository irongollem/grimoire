import { describe, expect, it } from "vitest";
import { asFighter, fightIsTold, fightRecordText, fightsSection, fightStateOf, MAX_COUNT, planFight, type FightsInView, type FightState } from "./fight";

const PREPARED = "00000000-0000-4000-8000-0000000000e1";
const MONSTER = "00000000-0000-4000-8000-0000000000e2";
const NPC = "00000000-0000-4000-8000-0000000000e3";

const view = (over: Partial<FightsInView> = {}): FightsInView => ({
  prepared: [{ id: PREPARED, name: "The Watching Pack", creatures: "3 Marzipan Sentries" }],
  fight: null,
  ...over,
});
const fight = (over: Partial<FightState> = {}): FightState => ({
  encounterId: PREPARED,
  name: "The Watching Pack",
  phase: "running",
  round: 2,
  fighters: [
    { name: "Rosie", side: "party", hp: 31, maxHp: 58 },
    { name: "Marzipan Sentry", side: "enemy", hp: 0, maxHp: 22 },
  ],
  ...over,
});

describe("fightsSection", () => {
  it("lists the fights prepared at this place with their ids, so one can be started", () => {
    const text = fightsSection(view());
    expect(text).toContain(PREPARED);
    expect(text).toContain("3 Marzipan Sentries");
  });

  it("says nothing at all at a place with no fight prepared and none under way", () => {
    expect(fightsSection({ prepared: [], fight: null })).toBe("");
  });

  // Bug caught: the narrator telling blows the board decides, or (seen live, 17 Nov 2026) turning away a thrown chair
  // with "resolve the fight on the fight screen" because it was told to keep out of the fight altogether.
  it("leaves the blows to the board, takes what the rules have no button for, and offers no other fight meanwhile", () => {
    const text = fightsSection(view({ fight: fight() }), "It is the player's turn. It still holds: Action.");
    expect(text).toContain("never narrate those");
    expect(text).toContain("fight_change");
    expect(text).toContain("It still holds: Action.");
    expect(text).not.toContain("fight screen");
    expect(text).not.toContain("Fights prepared at this place");
  });

  it("says a fight that has not begun is waiting on the player's initiative", () => {
    const text = fightsSection(view({ fight: fight({ phase: "waiting" }) }));
    expect(text).toContain("rolling initiative");
    expect(text).not.toContain("fight_change");
  });

  it("hands over how the fight stands once it is over: who is down and who is left", () => {
    const text = fightsSection(view({ fight: fight({ phase: "over" }) }));
    expect(text).toContain("is over");
    expect(text).toContain("Marzipan Sentry (enemy): down");
    expect(text).toContain("Rosie (party): 31 of 58 hit points");
  });
});

describe("planFight", () => {
  it("starts a fight prepared at this place by its id", () => {
    expect(planFight(view(), { encounter_id: PREPARED })).toMatchObject({ ok: true, plan: { kind: "prepared", encounterId: PREPARED, name: "The Watching Pack" } });
  });

  it("refuses a fight that is not listed for this place, however plausible the id", () => {
    expect(planFight(view(), { encounter_id: MONSTER }).ok).toBe(false);
    expect(planFight(view({ prepared: [] }), { encounter_id: PREPARED }).ok).toBe(false);
  });

  it("puts a fight together from looked-up creatures, one of each by default", () => {
    const planned = planFight(view(), { name: " Cellar rats ", creatures: [{ monster_id: MONSTER, count: 3 }, { npc_id: NPC }] });
    expect(planned).toMatchObject({
      ok: true,
      plan: { kind: "improvised", name: "Cellar rats", creatures: [{ monsterId: MONSTER, npcId: null, count: 3 }, { monsterId: null, npcId: NPC, count: 1 }] },
    });
  });

  it("refuses a creature with no id, with both ids, or with an id that is not one", () => {
    expect(planFight(view(), { name: "x", creatures: [{}] }).ok).toBe(false);
    expect(planFight(view(), { name: "x", creatures: [{ monster_id: MONSTER, npc_id: NPC }] }).ok).toBe(false);
    expect(planFight(view(), { name: "x", creatures: [{ monster_id: "a giant rat" }] }).ok).toBe(false);
  });

  it.each([0, MAX_COUNT + 1, 1.5, "3"])("refuses a count of %s", (count) => {
    expect(planFight(view(), { name: "x", creatures: [{ monster_id: MONSTER, count }] }).ok).toBe(false);
  });

  it("refuses a fight with no name or no creatures, and a mix of both ways of asking", () => {
    expect(planFight(view(), { creatures: [{ monster_id: MONSTER }] }).ok).toBe(false);
    expect(planFight(view(), { name: "x", creatures: [] }).ok).toBe(false);
    expect(planFight(view(), { encounter_id: PREPARED, name: "x" }).ok).toBe(false);
  });

  it("starts no second fight while one is under way, and may start one after the last is over", () => {
    expect(planFight(view({ fight: fight({ phase: "waiting" }) }), { encounter_id: PREPARED }).ok).toBe(false);
    expect(planFight(view({ fight: fight({ phase: "running" }) }), { encounter_id: PREPARED }).ok).toBe(false);
    expect(planFight(view({ fight: fight({ phase: "over" }) }), { encounter_id: PREPARED }).ok).toBe(true);
  });
});

describe("fightStateOf", () => {
  const base = { encounterId: PREPARED, name: "The Watching Pack", finished: false };
  const live = (over: Partial<{ isRunning: boolean; endedAt: string | null; round: number; combatants: unknown }> = {}) => ({
    isRunning: true, endedAt: null, round: 2, combatants: [], ...over,
  });

  it("is waiting before its first round, running while it is fought, over once it ended", () => {
    expect(fightStateOf({ ...base, live: null }).phase).toBe("waiting");
    expect(fightStateOf({ ...base, live: live({ isRunning: false, round: 0 }) }).phase).toBe("waiting");
    expect(fightStateOf({ ...base, live: live() }).phase).toBe("running");
    expect(fightStateOf({ ...base, live: live({ isRunning: false, endedAt: "2026-11-17T08:00:00Z" }) }).phase).toBe("over");
  });

  it("is over when the encounter is marked finished, even with no live row left", () => {
    expect(fightStateOf({ ...base, finished: true, live: null }).phase).toBe("over");
  });

  it("reads the combatants it can and drops what is not one", () => {
    const state = fightStateOf({ ...base, live: live({ combatants: [{ name: "Rosie", type: "player", faction_id: "players", hp: 31, max_hp: 58 }, { name: "" }, 7] }) });
    expect(state.fighters).toEqual([{ name: "Rosie", side: "party", hp: 31, maxHp: 58 }]);
  });
});

describe("asFighter", () => {
  it("puts a character on the party's side whatever faction row it carries, and a hostile on the enemy's", () => {
    expect(asFighter({ name: "Rosie", type: "player", faction_id: "neutral", hp: 5, max_hp: 9 })?.side).toBe("party");
    expect(asFighter({ name: "Sentry", type: "monster", faction_id: "enemy", hp: 5, max_hp: 9 })?.side).toBe("enemy");
    expect(asFighter({ name: "Cat", type: "monster", faction_id: "neutral", hp: 5, max_hp: 9 })?.side).toBe("other");
  });

  it("never reports hit points below zero", () => {
    expect(asFighter({ name: "Sentry", type: "monster", faction_id: "enemy", hp: -4, max_hp: 9 })?.hp).toBe(0);
  });
});

describe("fightIsTold", () => {
  it("lets go of a fight only once the narrator has been told it is over", () => {
    expect(fightIsTold(fight({ phase: "over" }))).toBe(true);
    expect(fightIsTold(fight({ phase: "running" }))).toBe(false);
    expect(fightIsTold(null)).toBe(false);
  });
});

describe("fightStateOf: a fight at the table is never shared with players", () => {
  const live = (round: number, isRunning = false) => ({ isRunning, endedAt: null, round, combatants: [] });

  // Bug caught: the narrator told for a whole fight that it is "about to begin", and offered no way to rule on it,
  // because only a fight shared with players counted as being fought.
  it("is being fought once its first round has begun, shared or not", () => {
    expect(fightStateOf({ encounterId: "e", name: "n", finished: false, live: live(1) }).phase).toBe("running");
    expect(fightStateOf({ encounterId: "e", name: "n", finished: false, live: live(0) }).phase).toBe("waiting");
    expect(fightStateOf({ encounterId: "e", name: "n", finished: false, live: live(0, true) }).phase).toBe("running");
  });
});

describe("fightRecordText", () => {
  const pack = (hounds: number[]): FightState => ({
    encounterId: "e",
    name: "The Watching Pack",
    phase: "running",
    round: 7,
    fighters: [{ name: "Rosie", side: "party", hp: 15, maxHp: 58 }, ...hounds.map((hp, i) => ({ name: `Spun Glass Hound ${i + 1}`, side: "enemy" as const, hp, maxHp: 16 }))],
  });

  // Bug caught live (17 Nov 2026): "the fight isnt in the story so far". Nothing put a fight on record.
  it("says who fought, who went down and how the rest ended it", () => {
    expect(fightRecordText(pack([0, 0, 16]), "they_give_in")).toBe(
      'Rosie fought "The Watching Pack": Spun Glass Hound 1 and Spun Glass Hound 2 went down; Spun Glass Hound 3 gave in.',
    );
  });

  it("says so when the party got away, and when nobody was left to fight", () => {
    expect(fightRecordText(pack([16, 4]), "you_get_away")).toContain("Rosie got away from Spun Glass Hound 1 and Spun Glass Hound 2");
    expect(fightRecordText(pack([0, 0]), "fought")).toBe('Rosie fought "The Watching Pack": Spun Glass Hound 1 and Spun Glass Hound 2 went down.');
  });

  // Bug caught: a fight the player lost recorded as if it had gone well.
  it("says when the played character fell", () => {
    const lost = pack([9]);
    lost.fighters[0].hp = 0;
    expect(fightRecordText(lost, "fought")).toContain("Rosie fell");
  });
});

