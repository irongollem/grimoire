import { describe, expect, it } from "vitest";
import { asFighter, fightIsTold, fightsSection, fightStateOf, MAX_COUNT, planFight, type FightsInView, type FightState } from "./fight";

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

  it("tells the narrator to keep out of a fight that is being fought, and offers no other fight meanwhile", () => {
    const text = fightsSection(view({ fight: fight() }));
    expect(text).toContain("Do not narrate attacks");
    expect(text).not.toContain("Fights prepared at this place");
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

  it("is waiting before the fight screen has opened it, running while it is fought, over once it ended", () => {
    expect(fightStateOf({ ...base, live: null }).phase).toBe("waiting");
    expect(fightStateOf({ ...base, live: live({ isRunning: false }) }).phase).toBe("waiting");
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
