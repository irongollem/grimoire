// The labelled fight set for the tactics evaluation (#1203 story 3). Each scenario is an invented creature in a small
// invented fight, with labels a Dungeon Master would give it: the turns that are sensible for THIS creature (`good`),
// the turns that are clearly wrong for it (`bad`), and one sentence why. A turn in neither list is acceptable but
// nothing to write home about.
//
// The labels were written from the situation and the creature, before any picker was run on a scenario. Option ids
// are the ones `turnOptions` produces for the scenario (`attack:<list>:<action>:<targetId>`, `dash:<id>`, `dodge`, ...),
// learned by listing the options once, which names turns and ranks nothing. `scenarios.test.ts` holds every label to
// an option that really exists after the gate and keeps the two lists apart.
//
// Everything is made up: creatures, adventurers and the lines of their notes. Nothing here is from a real campaign.

import {
  ally,
  creature,
  hero,
  melee,
  multiattack,
  mover,
  ranged,
  saveAction,
  asleep,
  type Creature,
  type Fight,
  type Terrain,
  type Wall,
} from "./fixtures.ts";
import type { RunCombatant } from "../../src/types/encounter.types.ts";

export type ScenarioTag =
  | "instinct" | "simple" | "trained" | "tactical"
  | "brute" | "skirmisher" | "artillery" | "controller" | "lurker" | "leader"
  | "melee" | "ranged" | "multiattack"
  | "cover-matters" | "cover-irrelevant"
  | "provokes" | "clean-path"
  | "long-range"
  | "morale-broken" | "morale-holds"
  | "note"
  | "nothing-in-reach"
  | "allies-in-the-way"
  | "wall" | "difficult-ground";

export interface Scenario {
  id: string;
  tags: ScenarioTag[];
  /** What the Dungeon Master sees, in a line. */
  setup: string;
  fight: Fight;
  /** Option ids a competent DM accepts for this creature. */
  good: string[];
  /** Option ids that are clearly wrong for it. */
  bad: string[];
  why: string;
}

// ── the adventurers ─────────────────────────────────────────────────────────────

const brannoch = (x: number, y: number, o: { hp?: number } = {}) => hero("brannoch", "Brannoch", x, y, { max: 44, ac: 18, ...o });
const ysolde = (x: number, y: number, o: { hp?: number; concentrating?: boolean } = {}) => hero("ysolde", "Ysolde", x, y, { max: 20, ac: 12, ...o });
const tamsin = (x: number, y: number, o: { hp?: number } = {}) => hero("tamsin", "Tamsin", x, y, { max: 30, ac: 16, ...o });
const pip = (x: number, y: number, o: { hp?: number; asleep?: boolean } = {}) =>
  hero("pip", "Pip", x, y, { max: 24, ac: 15, ...(o.hp === undefined ? {} : { hp: o.hp }), ...(o.asleep ? { conditions: [asleep] } : {}) });
const orrin = (x: number, y: number) => hero("orrin", "Orrin Lanternbearer", x, y, { max: 28, ac: 14 });

// ── the creatures ───────────────────────────────────────────────────────────────

const MUDGRUB = creature({ name: "Mudgrub", type: "beast", int: 1, speed: 30, actions: [melee("Bite", 4, "1d8+2", "piercing")] });
const ROTWALKER = creature({ name: "Rotwalker", type: "undead", int: 3, speed: 20, actions: [melee("Slam", 3, "1d6+1", "bludgeoning")] });
const GNARLHOUND = creature({ name: "Gnarlhound", type: "beast", int: 3, speed: 50, actions: [melee("Bite", 5, "2d6+3", "piercing")] });
const SLUDGE = creature({ name: "Gullet Sludge", type: "ooze", int: 1, speed: 20, actions: [melee("Pseudopod", 4, "1d6+2", "acid")] });
const CRAGMAW = creature({
  name: "Cragmaw Brute",
  type: "giant",
  int: 6,
  speed: 30,
  actions: [multiattack("Multiattack", [{ action: "Claw", count: 2 }]), melee("Claw", 6, "1d6+4", "slashing"), ranged("Hurl Boulder", 6, "2d6+4", "bludgeoning", 30, 60)],
});
const WARG = creature({ name: "Thornback Warg", type: "beast", int: 7, speed: 50, actions: [melee("Bite", 5, "2d6+3", "piercing")] });
const GRUBBER = creature({ name: "Burrow Grubber", type: "humanoid", int: 6, speed: 30, actions: [melee("Rusty Axe", 4, "1d8+2", "slashing")] });
const BANDIT = creature({
  name: "Gutter Bandit",
  type: "humanoid",
  int: 10,
  speed: 30,
  actions: [melee("Cudgel", 4, "1d6+2", "bludgeoning"), ranged("Shortbow", 4, "1d6+2", "piercing", 80, 320)],
});
const SLINGER = creature({ name: "Sallow Slinger", type: "humanoid", int: 10, speed: 30, actions: [ranged("Sling", 4, "1d4+2", "bludgeoning", 30, 120)] });
const HEXCALLER = creature({
  name: "Hexcaller",
  type: "humanoid",
  int: 9,
  speed: 30,
  actions: [melee("Spiteful Rap", 2, "1d4", "bludgeoning"), ranged("Bolt", 5, "1d10", "force", 120, 240), saveAction("Withering Word")],
});
const RAIDER = creature({ name: "Hexblade Raider", type: "humanoid", int: 14, speed: 30, actions: [melee("Blade", 6, "1d8+3", "slashing")] });
const SNIPER = creature({ name: "Thornshot Sniper", type: "humanoid", int: 13, speed: 30, actions: [ranged("Longbow", 6, "1d8+3", "piercing", 150, 600)] });
const VEILKNIFE = creature({ name: "Veilknife", type: "humanoid", int: 13, speed: 30, skills: { stealth: "+7" }, actions: [melee("Dagger", 6, "1d4+4", "piercing")] });
const WINDRUNNER = creature({ name: "Windrunner", type: "humanoid", int: 12, speed: 40, actions: [melee("Spear", 5, "1d8+3", "piercing")] });
const CAPTAIN = creature({ name: "Captain Veyra", type: "humanoid", int: 13, speed: 30, tactics: { role: "leader" }, actions: [melee("Sabre", 6, "1d8+3", "slashing")] });

// oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field (#1203), not a promise
const morale = (breaksAt: number, then: "flee" | "surrender" | "fight_on") => ({ breaksAt, then });

const withTactics = (base: Creature, tactics: NonNullable<Creature["block"]["tactics"]>, name?: string): Creature => ({
  ...base,
  name: name === undefined ? base.name : name,
  block: { ...base.block, tactics },
});

// ── helpers for the labels ──────────────────────────────────────────────────────

const hit = (action: string, target: string) => `attack:actions:${action}:${target}`;

const wall = (x: number, y1: number, y2: number): Wall => [[x, y1], [x, y2]];
const fight = (c: Creature, combatants: RunCombatant[], terrain?: Terrain): Fight => ({ creature: c, combatants, ...(terrain ? { terrain } : {}) });

// ── the set ─────────────────────────────────────────────────────────────────────

export const SCENARIOS: Scenario[] = [
  // ── instinct ──
  {
    id: "beast-bites-what-is-in-front",
    tags: ["instinct", "brute", "melee", "morale-holds"],
    setup: "A mindless bog beast with two adventurers close: Brannoch beside it, Ysolde two squares off.",
    fight: fight(MUDGRUB, [mover(0, 0, { max: 30 }), brannoch(1, 0), ysolde(0, 2)]),
    good: [hit("Bite", "brannoch"), hit("Bite", "ysolde")],
    bad: ["flee"],
    why: "An animal at full strength bites whoever is in front of it; either target is fine and running is not.",
  },
  {
    id: "zombie-goes-for-the-near-one",
    tags: ["instinct", "brute", "melee", "morale-holds"],
    setup: "A slow shambling corpse, Tamsin four squares off and Pip six.",
    fight: fight(ROTWALKER, [mover(0, 0, { max: 22 }), tamsin(3, 0), pip(7, 0)]),
    good: [hit("Slam", "tamsin")],
    bad: ["flee", "dash:pip"],
    why: "The dead walk at the nearest living thing and never run; passing Tamsin to chase Pip is not what a zombie does.",
  },
  {
    id: "hound-nearly-dead-runs",
    tags: ["instinct", "skirmisher", "melee", "morale-broken"],
    setup: "A hound at 4 of 30 hit points with Brannoch beside it.",
    fight: fight(GNARLHOUND, [mover(0, 0, { max: 30, hp: 4 }), brannoch(1, 0)]),
    good: ["flee"],
    bad: [],
    why: "An animal near death bolts.",
  },
  {
    id: "hound-hurt-but-not-broken-fights",
    tags: ["instinct", "skirmisher", "melee", "morale-holds"],
    setup: "The same hound at 12 of 30 hit points, Brannoch beside it and Pip two squares off.",
    fight: fight(GNARLHOUND, [mover(0, 0, { max: 30, hp: 12 }), brannoch(1, 0), pip(2, 2)]),
    good: [hit("Bite", "brannoch"), hit("Bite", "pip")],
    bad: ["flee"],
    why: "At 40 percent an animal is hurt, not broken; it keeps biting.",
  },
  {
    id: "sludge-hurt-keeps-coming",
    tags: ["instinct", "brute", "melee", "morale-holds"],
    setup: "A gullet sludge at 3 of 40 hit points, Ysolde beside it, Tamsin eight squares off.",
    fight: fight(SLUDGE, [mover(0, 0, { max: 40, hp: 3 }), ysolde(1, 0), tamsin(8, 0)]),
    good: [hit("Pseudopod", "ysolde")],
    bad: ["flee"],
    why: "An ooze has no fear and no sense of its own wounds; it strikes the thing next to it.",
  },
  {
    id: "beast-far-off-closes-in",
    tags: ["instinct", "brute", "nothing-in-reach"],
    setup: "A bog beast with the whole party fifty feet away and no way to bite anyone this turn.",
    fight: fight(MUDGRUB, [mover(0, 0, { max: 30 }), brannoch(14, 0), ysolde(14, 3)]),
    good: ["dash:brannoch", "dash:ysolde"],
    bad: ["flee"],
    why: "A hungry animal with prey in sight closes the distance; running away from them is wrong.",
  },

  // ── simple ──
  {
    id: "giant-uses-both-claws",
    tags: ["simple", "brute", "melee", "multiattack"],
    setup: "A giant with Tamsin beside it. It has a two-claw Multiattack, a single Claw and a thrown boulder.",
    fight: fight(CRAGMAW, [mover(0, 0, { max: 59 }), tamsin(1, 0)]),
    good: [hit("Multiattack", "tamsin")],
    bad: [hit("Claw", "tamsin"), hit("Hurl Boulder", "tamsin"), "flee"],
    why: "It has a full round of two claws; one claw, or a boulder thrown at an enemy beside it, wastes the turn.",
  },
  {
    id: "giant-everyone-out-of-reach",
    tags: ["simple", "brute", "nothing-in-reach", "ranged"],
    setup: "The giant with the party a hundred and thirty feet away, beyond even a thrown boulder.",
    fight: fight(CRAGMAW, [mover(0, 0, { max: 59 }), brannoch(26, 0), ysolde(26, 3)]),
    good: ["dash:brannoch", "dash:ysolde"],
    bad: ["dodge", "flee"],
    why: "Nothing can be struck, so it closes in; standing still or running both give the fight away.",
  },
  {
    id: "warg-leaps-past-the-fighter",
    tags: ["simple", "skirmisher", "melee", "provokes"],
    setup: "A warg beside Brannoch (armor 18). Ysolde, a wizard (armor 12), stands thirty feet off; reaching her means passing Brannoch.",
    fight: fight(WARG, [mover(0, 0, { max: 40 }), brannoch(1, 0), ysolde(0, 6)]),
    good: [hit("Bite", "ysolde")],
    bad: ["flee", "dodge"],
    why: "A pack hunter goes for the soft target and will take one swing from the fighter to get her.",
  },
  {
    id: "grubber-hurt-not-broken",
    tags: ["simple", "brute", "melee", "morale-holds"],
    setup: "A grubber at 8 of 26 hit points (31 percent), Ysolde beside it.",
    fight: fight(GRUBBER, [mover(0, 0, { max: 26, hp: 8 }), ysolde(1, 0)]),
    good: [hit("Rusty Axe", "ysolde")],
    bad: ["flee", "dodge"],
    why: "A wounded grubber next to a frail wizard presses on.",
  },
  {
    id: "grubber-broken-runs",
    tags: ["simple", "brute", "morale-broken"],
    setup: "A grubber at 5 of 26 hit points with Ysolde and Tamsin beside it.",
    fight: fight(GRUBBER, [mover(0, 0, { max: 26, hp: 5 }), ysolde(1, 0), tamsin(2, 0)]),
    good: ["flee"],
    bad: ["dodge"],
    why: "At 19 percent it has had enough; it runs, it does not stand and Dodge.",
  },
  {
    id: "grubber-wall-in-the-way",
    tags: ["simple", "brute", "wall", "nothing-in-reach"],
    setup: "A grubber behind a long wall; the party stands on the far side.",
    fight: fight(GRUBBER, [mover(0, 0, { max: 26 }), brannoch(6, 0), ysolde(6, 2)], { walls: [wall(3, -5, 5)] }),
    good: ["dash:brannoch", "dash:ysolde"],
    bad: ["dodge", "flee"],
    why: "It has to go around the wall to reach them, so it runs the long way; it neither waits nor runs off.",
  },
  {
    id: "grubber-through-rubble",
    tags: ["simple", "brute", "difficult-ground", "nothing-in-reach"],
    setup: "A grubber with Ysolde thirty-five feet off across a field of rubble that costs double to cross.",
    fight: fight(GRUBBER, [mover(0, 0, { max: 26 }), ysolde(7, 0)], {
      difficult: Array.from({ length: 6 }, (_, i) => i + 1).flatMap((x) => [-3, -2, -1, 0, 1, 2, 3].map((y) => `${x},${y}`)),
    }),
    good: ["dash:ysolde"],
    bad: ["dodge", "flee"],
    why: "It cannot strike her this turn; it pushes through the rubble toward her.",
  },

  // ── trained ──
  {
    id: "slinger-shoots-the-wizard",
    tags: ["trained", "artillery", "ranged", "morale-holds", "cover-irrelevant"],
    setup: "A slinger with Brannoch (armor 18) and Ysolde (armor 12) both thirty feet away in the open.",
    fight: fight(SLINGER, [mover(0, 0, { max: 30 }), brannoch(6, 0), ysolde(6, 2)]),
    good: [hit("Sling", "ysolde")],
    bad: ["flee", "dodge"],
    why: "Same range, same cover, so the shot goes to the one it is likeliest to hit and hurt.",
  },
  {
    id: "slinger-pinned-by-the-fighter",
    tags: ["trained", "artillery", "ranged", "provokes"],
    setup: "A slinger with Brannoch standing beside it and Tamsin forty feet off.",
    fight: fight(SLINGER, [mover(0, 0, { max: 30 }), brannoch(1, 0), tamsin(8, 0)]),
    good: ["disengage"],
    bad: [],
    why: "Shooting with a fighter in its face is at disadvantage and walking away invites a swing; a trained archer backs off clean.",
  },
  {
    id: "bandit-alone-and-bleeding",
    tags: ["trained", "brute", "melee", "morale-holds"],
    setup: "A lone bandit at 12 of 34 hit points (35 percent), no friends left, three adventurers around it.",
    fight: fight(BANDIT, [mover(0, 0, { max: 34, hp: 12 }), brannoch(1, 0), pip(0, 2), tamsin(3, 1)]),
    good: ["flee", "disengage"],
    bad: [],
    why: "Alone, bleeding and outnumbered three to one, a thinking bandit cuts and runs even before the book says it breaks.",
  },
  {
    id: "bandit-with-friends-fights",
    tags: ["trained", "brute", "melee", "morale-holds"],
    setup: "A bandit at 20 of 34 hit points with two bandit friends beside it, Brannoch and Pip in front.",
    fight: fight(BANDIT, [mover(0, 0, { max: 34, hp: 20 }), ally("bandit-b", "Bandit B", 0, 1), ally("bandit-c", "Bandit C", 0, -1), brannoch(1, 0), pip(1, 1)]),
    good: [hit("Cudgel", "brannoch"), hit("Cudgel", "pip"), hit("Shortbow", "pip")],
    bad: ["flee", "disengage", "dodge"],
    why: "With friends on both sides and a healthy half of its hit points, it fights.",
  },
  {
    id: "hexcaller-shoots-not-rap",
    tags: ["trained", "controller", "ranged", "melee", "cover-irrelevant"],
    setup: "A hexcaller with a ranged bolt and a feeble melee rap. Brannoch and Ysolde are twenty feet away.",
    fight: fight(HEXCALLER, [mover(0, 0, { max: 30 }), brannoch(4, 0), ysolde(4, 2)]),
    good: [hit("Bolt", "ysolde")],
    bad: [hit("Spiteful Rap", "brannoch"), hit("Spiteful Rap", "ysolde"), "flee", "dodge"],
    why: "A caster with a bolt uses the bolt, at the soft target, and does not walk up to rap with a stick.",
  },
  {
    id: "hexcaller-backs-away-from-the-fighter",
    tags: ["trained", "controller", "ranged", "provokes"],
    setup: "The hexcaller with Brannoch right next to it, Ysolde far off.",
    fight: fight(HEXCALLER, [mover(0, 0, { max: 30 }), brannoch(1, 0), ysolde(8, 0)]),
    good: ["disengage"],
    bad: [hit("Spiteful Rap", "brannoch")],
    why: "A caster in a fighter's reach gets away first; rapping a man in plate with a stick is the worst use of the turn.",
  },
  {
    id: "slinger-long-shot-or-clear-shot",
    tags: ["trained", "artillery", "ranged", "long-range"],
    setup: "A slinger; Pip is badly hurt but a hundred feet away (long range), Ysolde is untouched at twenty-five feet.",
    fight: fight(SLINGER, [mover(0, 0, { max: 30 }), ysolde(5, 0), pip(20, 0, { hp: 5 })]),
    good: [hit("Sling", "ysolde")],
    bad: [hit("Sling", "pip")],
    why: "A long shot at disadvantage against armor 15 is mostly a waste; the clear shot at the wizard is the better turn.",
  },
  {
    id: "slinger-nothing-in-range",
    tags: ["trained", "artillery", "ranged", "nothing-in-reach"],
    setup: "A slinger with the party two hundred and fifty feet off, past the sling's longest range.",
    fight: fight(SLINGER, [mover(0, 0, { max: 30 }), brannoch(50, 0), tamsin(50, 3)]),
    good: ["dash:brannoch", "dash:tamsin"],
    bad: ["dodge", "flee"],
    why: "Nothing is in range, so it closes the distance.",
  },
  {
    id: "bandit-kill-shot",
    tags: ["trained", "brute", "melee", "morale-holds"],
    setup: "A healthy bandit with three adventurers around it; Pip is at 3 of 24 hit points.",
    fight: fight(BANDIT, [mover(0, 0, { max: 34 }), brannoch(1, 0), tamsin(0, 1), pip(-1, 0, { hp: 3 })]),
    good: [hit("Cudgel", "pip"), hit("Shortbow", "pip")],
    bad: ["flee", "dodge"],
    why: "One blow drops the rogue; a thinking bandit takes the kill.",
  },
  {
    id: "chief-surrenders",
    tags: ["trained", "brute", "morale-broken"],
    setup: "A bandit chief who yields when badly hurt, at 40 percent with Brannoch beside him and his authored morale at one half.",
    fight: fight(
      withTactics(BANDIT, { morale: morale(0.5, "surrender") }, "Bandit Chief"),
      [mover(0, 0, { max: 40, hp: 16 }), brannoch(1, 0)],
    ),
    good: ["surrender"],
    bad: [],
    why: "His own rule says he yields at half; there is nothing else on the list.",
  },
  {
    id: "coward-note-stays-back",
    tags: ["trained", "brute", "ranged", "melee", "note"],
    setup: "A bandit whose note says it lets its friends fight and never closes to melee while one still stands. Ysolde is thirty-five feet away; the friend is fighting Brannoch.",
    fight: fight(
      withTactics(BANDIT, { note: "Cowardly: stays behind its friends and never closes to melee while any friend still stands." }),
      [mover(0, 0, { max: 34 }), ally("bandit-b", "Bandit B", 6, 3), brannoch(7, 3), ysolde(7, 0)],
    ),
    good: [hit("Shortbow", "ysolde"), hit("Shortbow", "brannoch")],
    bad: [hit("Cudgel", "ysolde"), hit("Cudgel", "brannoch")],
    why: "The note forbids walking into melee while a friend stands; the bow keeps it behind them.",
  },
  {
    id: "door-warden-nobody-adjacent",
    tags: ["trained", "brute", "melee", "note", "nothing-in-reach"],
    setup: "A door warden, note: guards the door and never leaves it. Pip is twenty-five feet off, Brannoch ten.",
    fight: fight(
      withTactics(
        creature({ name: "Door Warden", type: "humanoid", int: 10, speed: 30, actions: [melee("Spear", 5, "1d8+3", "piercing")] }),
        { note: "Guards the door and never leaves it." },
      ),
      [mover(0, 0, { max: 38 }), brannoch(1, 2), pip(5, 0)],
    ),
    good: ["dodge"],
    bad: [hit("Spear", "pip"), "flee"],
    why: "The note keeps it at the door: with nobody in reach, it holds the door.",
  },
  {
    id: "door-warden-picks-the-adjacent-one",
    tags: ["trained", "brute", "melee", "note"],
    setup: "The door warden with Brannoch beside it and Pip, badly hurt, twenty-five feet away.",
    fight: fight(
      withTactics(
        creature({ name: "Door Warden", type: "humanoid", int: 10, speed: 30, actions: [melee("Spear", 5, "1d8+3", "piercing")] }),
        { note: "Guards the door and never leaves it." },
      ),
      [mover(0, 0, { max: 38 }), brannoch(1, 0), pip(6, 0, { hp: 6 })],
    ),
    good: [hit("Spear", "brannoch")],
    bad: [hit("Spear", "pip"), "flee"],
    why: "It will not leave the door, so the wounded rogue is not an option; it fights the man in front of it.",
  },
  {
    id: "duelist-spares-the-helpless",
    tags: ["trained", "brute", "melee", "note"],
    setup: "A duelist who never strikes a helpless foe. Pip lies asleep beside it at 5 of 24 hit points; Brannoch stands awake four squares off.",
    fight: fight(
      withTactics(
        creature({ name: "Honour Duelist", type: "humanoid", int: 11, speed: 30, actions: [melee("Rapier", 6, "1d8+3", "piercing")] }),
        { note: "Never strikes a helpless foe, even in a fight to the death." },
      ),
      [mover(0, 0, { max: 36 }), pip(1, 0, { hp: 5, asleep: true }), brannoch(4, 0)],
    ),
    good: [hit("Rapier", "brannoch")],
    bad: [hit("Rapier", "pip")],
    why: "The note says no. The sleeping rogue is the easy kill and exactly what it will not do.",
  },
  {
    id: "sapper-note-lowest-armor",
    tags: ["trained", "brute", "melee", "note"],
    setup: "A sapper whose note says it always goes for whoever wears the least armor. Brannoch (armor 18) is beside it; Ysolde (armor 12) is twenty feet off. Both are unhurt.",
    fight: fight(
      withTactics(
        creature({ name: "Tunnel Sapper", type: "humanoid", int: 8, speed: 30, actions: [melee("Pick", 5, "1d8+3", "piercing")] }),
        { note: "Always goes for whoever wears the least armour." },
      ),
      [mover(0, 0, { max: 30 }), brannoch(1, 0), ysolde(0, 4)],
    ),
    good: [hit("Pick", "ysolde")],
    bad: ["flee"],
    why: "The note names its target; Ysolde has the least armor and is within one move.",
  },
  {
    id: "bandit-steady-in-melee",
    tags: ["trained", "brute", "melee", "morale-holds", "clean-path"],
    setup: "A healthy bandit beside Brannoch; Tamsin and Pip a few squares off. No friends nearby.",
    fight: fight(BANDIT, [mover(0, 0, { max: 34 }), brannoch(1, 0), tamsin(4, 0), pip(5, 2)]),
    good: [hit("Cudgel", "brannoch"), hit("Shortbow", "tamsin"), hit("Shortbow", "pip"), hit("Cudgel", "tamsin"), hit("Cudgel", "pip")],
    bad: ["flee", "dodge"],
    why: "At full strength a bandit attacks; the exact target is a matter of taste.",
  },

  // ── tactical ──
  {
    id: "raider-cuts-the-concentrating-wizard",
    tags: ["tactical", "brute", "melee", "provokes"],
    setup: "A raider beside Brannoch. Ysolde stands fifteen feet away concentrating on a spell. Getting to her costs a swing from Brannoch.",
    fight: fight(RAIDER, [mover(0, 0, { max: 45 }), brannoch(1, 0), ysolde(4, 0, { concentrating: true })]),
    good: [hit("Blade", "ysolde")],
    bad: [hit("Blade", "brannoch")],
    why: "A clever fighter breaks the spell holding the room; one opportunity attack is cheap against that.",
  },
  {
    id: "sniper-shoots-from-cover",
    tags: ["tactical", "artillery", "ranged", "cover-matters"],
    setup: "A sniper beside a pillar. Brannoch and Tamsin stand sixty feet off in the open; shooting past the pillar leaves it covered.",
    fight: fight(SNIPER, [mover(0, 0, { max: 30 }), brannoch(12, 0), tamsin(12, -3)], { walls: [[[1, -0.4], [1, 0.9]]] }),
    good: [hit("Longbow", "brannoch"), hit("Longbow", "tamsin")],
    bad: ["flee", "dodge"],
    why: "In range of both it shoots, and takes the shot from behind the pillar if there is one.",
  },
  {
    id: "veilknife-hides-behind-the-wall",
    tags: ["tactical", "lurker", "melee", "cover-matters", "nothing-in-reach"],
    setup: "A veilknife (assassin) with the party forty feet off and a stone wall beside it that blocks every line to it.",
    fight: fight(VEILKNIFE, [mover(0, 0, { max: 32 }), brannoch(8, 0), ysolde(8, 2)], { walls: [wall(2, -6, 8)] }),
    good: ["hide"],
    bad: ["flee", "dodge"],
    why: "An ambusher who cannot reach anyone this turn vanishes behind the wall and strikes from it later.",
  },
  {
    id: "veilknife-ambush-note",
    tags: ["tactical", "lurker", "melee", "cover-matters", "note"],
    setup: "The veilknife with the same wall; its note: waits in ambush and will not show itself while any foe is more than ten feet away.",
    fight: fight(
      withTactics(VEILKNIFE, { note: "Waits in ambush and will not show itself while any foe is more than ten feet away." }),
      [mover(0, 0, { max: 32 }), brannoch(8, 0), ysolde(8, 2)],
      { walls: [wall(2, -6, 8)] },
    ),
    good: ["hide"],
    bad: ["dash:brannoch", "dash:ysolde", "flee"],
    why: "The note keeps it out of sight until the party is close; running at them is the one thing it will not do.",
  },
  {
    id: "veilknife-takes-the-open-throat",
    tags: ["tactical", "lurker", "melee", "morale-holds"],
    setup: "The veilknife standing beside Ysolde (armor 12) while Brannoch is busy with a friend ten feet away.",
    fight: fight(VEILKNIFE, [mover(0, 0, { max: 32 }), ysolde(1, 0), brannoch(5, 0), ally("raider-b", "Raider B", 6, 0)]),
    good: [hit("Dagger", "ysolde")],
    bad: ["flee", "disengage"],
    why: "The wizard is right there and undefended; an assassin that backed off now would be wasting the opening.",
  },
  {
    id: "captain-leads-from-the-front",
    tags: ["tactical", "leader", "melee", "morale-holds"],
    setup: "A captain with two soldiers on her flanks; Pip and Brannoch are in front.",
    fight: fight(CAPTAIN, [mover(0, 0, { max: 50 }), ally("soldier-a", "Soldier A", 0, 1), ally("soldier-b", "Soldier B", 0, -1), brannoch(1, 0), pip(1, 1)]),
    good: [hit("Sabre", "brannoch"), hit("Sabre", "pip")],
    bad: ["flee", "disengage"],
    why: "A captain at full strength with her soldiers beside her fights where they fight.",
  },
  {
    id: "windrunner-hits-the-soft-target",
    tags: ["tactical", "skirmisher", "melee", "provokes"],
    setup: "A fast scout beside Brannoch; Ysolde, whose spell is in play, is thirty-five feet away.",
    fight: fight(WINDRUNNER, [mover(0, 0, { max: 34 }), brannoch(1, 0), ysolde(0, 7, { concentrating: true })]),
    good: [hit("Spear", "ysolde")],
    bad: ["flee", "dodge"],
    why: "A skirmisher's job is to slip the front line and spear the caster.",
  },
  {
    id: "raider-wounded-but-clever",
    tags: ["tactical", "brute", "melee", "morale-holds"],
    setup: "A raider at 13 of 45 hit points (29 percent), alone, with Brannoch and Tamsin on it.",
    fight: fight(RAIDER, [mover(0, 0, { max: 45, hp: 13 }), brannoch(1, 0), tamsin(0, 1)]),
    good: ["flee", "disengage"],
    bad: [],
    why: "Alone, nearly dead, outnumbered: a clever fighter lives to fight another day.",
  },
  {
    id: "raider-spellcaster-hunter-no-concentration",
    tags: ["tactical", "brute", "melee", "clean-path"],
    setup: "A raider with nobody beside it; Brannoch at six squares (full) and Ysolde at three squares (hurt to 9 of 20, no spell held).",
    fight: fight(RAIDER, [mover(0, 0, { max: 45 }), brannoch(6, 0), ysolde(3, 1, { hp: 9 })]),
    good: [hit("Blade", "ysolde")],
    bad: ["flee", "dodge"],
    why: "The wounded wizard is nearest and weakest; no reason to walk past her to the fighter.",
  },

  {
    id: "prowler-note-hates-the-lantern",
    tags: ["simple", "brute", "melee", "note", "morale-holds"],
    setup: "A prowler whose note says it hates whoever carries the lantern above everyone else. Tamsin is beside it; Orrin Lanternbearer is twenty feet away.",
    fight: fight(
      withTactics(
        creature({ name: "Lantern Prowler", type: "monstrosity", int: 7, speed: 30, actions: [melee("Fang", 4, "1d6+2", "piercing")] }),
        { note: "Is drawn to light and hates whoever carries the lantern above everyone else." },
      ),
      [mover(0, 0, { max: 28 }), tamsin(1, 0), orrin(4, 0)],
    ),
    good: [hit("Fang", "orrin")],
    bad: ["flee"],
    why: "The note names its prey: the lantern bearer is a short move away, and it passes Tamsin to reach him.",
  },
  {
    id: "slinger-friend-in-the-line",
    tags: ["trained", "artillery", "ranged", "allies-in-the-way", "cover-matters"],
    setup: "A slinger whose friend stands between it and Pip, locked in a fight; Tamsin is out in the open to the side.",
    fight: fight(SLINGER, [mover(0, 0, { max: 30 }), ally("bandit-b", "Bandit B", 3, 0), pip(4, 0), tamsin(4, 5)]),
    good: [hit("Sling", "pip"), hit("Sling", "tamsin")],
    bad: ["flee", "dodge"],
    why: "Both are in range; a friend in the line costs a little accuracy, so either target is a fair shot.",
  },

  // ── more noted creatures (the note comparison stands on these and the seven above) ──
  {
    id: "bodyguard-note-stays-near-the-shaman",
    tags: ["trained", "brute", "melee", "note"],
    setup: "A bodyguard whose note says it never strays more than ten feet from Shaman Orsk. Brannoch is two squares off; Pip, badly hurt, is thirty-five feet away.",
    fight: fight(
      withTactics(
        creature({ name: "Orsk's Bodyguard", type: "humanoid", int: 9, speed: 30, actions: [melee("Spear", 5, "1d8+3", "piercing")] }),
        { note: "Bodyguard to Shaman Orsk: never strays more than ten feet from the shaman." },
      ),
      [mover(0, 0, { max: 36 }), ally("orsk", "Shaman Orsk", 0, 3), brannoch(2, 0), pip(7, 0, { hp: 6 })],
    ),
    good: [hit("Spear", "brannoch")],
    bad: [hit("Spear", "pip"), "flee"],
    why: "The shaman is three squares behind it; the hurt rogue is far past the ten-foot leash, and the fighter is not.",
  },
  {
    id: "grudge-note-hates-tamsin",
    tags: ["trained", "brute", "melee", "note"],
    setup: "A veteran whose note says it holds a grudge against Tamsin and goes after her over anyone else. Brannoch, wounded, is beside it; Tamsin, unhurt, is twenty feet off.",
    fight: fight(
      withTactics(
        creature({ name: "Scarred Veteran", type: "humanoid", int: 8, speed: 30, actions: [melee("Mace", 5, "1d6+3", "bludgeoning")] }),
        { note: "Holds a grudge against Tamsin and goes after her over anyone else." },
      ),
      [mover(0, 0, { max: 38 }), brannoch(1, 0, { hp: 20 }), tamsin(4, 2)],
    ),
    good: [hit("Mace", "tamsin")],
    bad: ["flee"],
    why: "The note names Tamsin; the wounded fighter beside it is the rules' pick and not its.",
  },
  {
    id: "life-debt-note-spares-pip",
    tags: ["simple", "brute", "melee", "note"],
    setup: "A ruffian whose note says it owes Pip a life debt and never raises a hand against her. Pip, hurt, stands beside it; Brannoch is four squares off.",
    fight: fight(
      withTactics(
        creature({ name: "Debt-bound Ruffian", type: "humanoid", int: 7, speed: 30, actions: [melee("Club", 4, "1d6+2", "bludgeoning")] }),
        { note: "Owes Pip a life debt and will never raise a hand against her." },
      ),
      [mover(0, 0, { max: 30 }), pip(1, 0, { hp: 8 }), brannoch(4, 0)],
    ),
    good: [hit("Club", "brannoch")],
    bad: [hit("Club", "pip")],
    why: "The note forbids striking Pip, however hurt and however near she is.",
  },
  {
    id: "altar-note-never-moves",
    tags: ["trained", "brute", "melee", "note", "nothing-in-reach"],
    setup: "A priest-guardian whose note says it roots itself to the altar and never moves from its square. Tamsin is fifteen feet off and Brannoch twenty; nobody is beside it.",
    fight: fight(
      withTactics(
        creature({ name: "Altar Guardian", type: "humanoid", int: 10, speed: 30, actions: [melee("Flail", 5, "1d8+3", "bludgeoning")] }),
        { note: "Roots itself to the altar: never moves from its square." },
      ),
      [mover(0, 0, { max: 36 }), tamsin(3, 0), brannoch(0, 4)],
    ),
    good: ["dodge"],
    bad: [hit("Flail", "tamsin"), hit("Flail", "brannoch"), "flee"],
    why: "Every attack means leaving the altar; with nobody in reach it holds its square.",
  },
  {
    id: "spellbreaker-note-goes-for-the-wizard",
    tags: ["trained", "brute", "melee", "note"],
    setup: "A spellbreaker whose note says it goes for spellcasters and ignores warriors. Brannoch the Fighter, wounded, is beside it; Ysolde the Wizard is twenty feet off.",
    fight: fight(
      withTactics(
        creature({ name: "Spellbreaker", type: "humanoid", int: 10, speed: 30, actions: [melee("Cleaver", 5, "1d10+3", "slashing")] }),
        { note: "Goes for spellcasters and ignores warriors." },
      ),
      [mover(0, 0, { max: 36 }), hero("brannoch", "Brannoch the Fighter", 1, 0, { max: 44, ac: 18, hp: 20 }), hero("ysolde", "Ysolde the Wizard", 4, 2, { max: 20, ac: 12 })],
    ),
    good: [hit("Cleaver", "ysolde")],
    bad: ["flee"],
    why: "The note names its prey by kind: the wizard, not the wounded fighter next to it.",
  },
  {
    id: "honest-steel-note-no-poison",
    tags: ["trained", "brute", "melee", "ranged", "note"],
    setup: "A duelist with a sword and a poisoned dart (the dart hits harder). Its note: refuses the poison dart and fights only with honest steel. Tamsin stands twenty feet off.",
    fight: fight(
      withTactics(
        creature({ name: "Steel Duelist", type: "humanoid", int: 10, speed: 30, actions: [melee("Sword", 5, "1d8+3", "slashing"), ranged("Poison Dart", 5, "3d6+3", "poison", 30, 90)] }),
        { note: "Refuses to use the poison dart; fights only with honest steel." },
      ),
      [mover(0, 0, { max: 34 }), tamsin(4, 0)],
    ),
    good: [hit("Sword", "tamsin")],
    bad: [hit("Poison Dart", "tamsin")],
    why: "The dart is the stronger turn and the one the note forbids.",
  },
  {
    id: "chest-note-never-steps-away",
    tags: ["trained", "brute", "melee", "note"],
    setup: "A chest-guard whose note says it never steps away from the chest it stands on. Brannoch, unhurt, is beside it; Tamsin, badly hurt, is twenty-five feet away.",
    fight: fight(
      withTactics(
        creature({ name: "Chest Guard", type: "humanoid", int: 10, speed: 30, actions: [melee("Halberd", 5, "1d10+3", "slashing")] }),
        { note: "Guards the treasure chest at its feet and will not step away from it." },
      ),
      [mover(0, 0, { max: 38 }), brannoch(1, 0), tamsin(0, 5, { hp: 8 })],
    ),
    good: [hit("Halberd", "brannoch")],
    bad: [hit("Halberd", "tamsin"), "flee", "disengage"],
    why: "It will not leave the chest, so it fights the one who comes to it.",
  },
  {
    id: "irrelevant-note-buttons",
    tags: ["tactical", "brute", "melee", "note", "morale-holds"],
    setup: "A raider whose note is about something else: it is fond of its collection of shiny buttons. Tamsin, hurt, is beside it; Brannoch is four squares off.",
    fight: fight(
      withTactics(RAIDER, { note: "Fond of its collection of shiny buttons." }),
      [mover(0, 0, { max: 45 }), tamsin(1, 0, { hp: 12 }), brannoch(5, 0)],
    ),
    good: [hit("Blade", "tamsin")],
    bad: ["flee", "dodge", "disengage"],
    why: "The note has nothing to do with the fight; it strikes the hurt cleric beside it as it would without one.",
  },
  {
    id: "irrelevant-note-rhymes",
    tags: ["simple", "brute", "melee", "note", "morale-holds"],
    setup: "A hobgoblin whose note says it speaks only in rhymes and hates the cold. Pip and Tamsin are both a few squares off in an ordinary corridor.",
    fight: fight(
      withTactics(
        creature({ name: "Rhyming Hobgoblin", type: "humanoid", int: 7, speed: 30, actions: [melee("Morningstar", 4, "1d8+2", "piercing")] }),
        { note: "Speaks only in rhymes and hates the cold." },
      ),
      [mover(0, 0, { max: 30 }), pip(3, 0), tamsin(4, 2)],
    ),
    good: [hit("Morningstar", "pip"), hit("Morningstar", "tamsin")],
    bad: ["flee", "dodge"],
    why: "Speech and weather do not change who it hits; either target is fine.",
  },
  {
    id: "no-downed-foe-note",
    tags: ["trained", "brute", "melee", "note"],
    setup: "A knight whose note says it never strikes a foe who is down. Pip lies prone beside it at 5 of 24 hit points; Brannoch stands four squares off.",
    fight: fight(
      withTactics(
        creature({ name: "Oathbound Knight", type: "humanoid", int: 10, speed: 30, actions: [melee("Longsword", 6, "1d8+4", "slashing")] }),
        { note: "Never strikes a foe who is down on the ground." },
      ),
      [mover(0, 0, { max: 40 }), hero("pip", "Pip", 1, 0, { max: 24, ac: 15, hp: 5, conditions: [{ name: "Prone" }] }), brannoch(4, 0)],
    ),
    good: [hit("Longsword", "brannoch")],
    bad: [hit("Longsword", "pip")],
    why: "The note rules out the prone rogue, the easy kill; the standing fighter is a fair fight.",
  },
  {
    id: "clutch-note-hits-whoever-touches-it",
    tags: ["trained", "brute", "melee", "note"],
    setup: "A nest-warden whose note says it attacks whoever is touching the egg clutch. Tamsin, hurt, is beside the warden; Brannoch stands against the Egg Clutch fifteen feet away.",
    fight: fight(
      withTactics(
        creature({ name: "Nest Warden", type: "monstrosity", int: 9, speed: 30, actions: [melee("Talons", 5, "1d8+3", "slashing")] }),
        { note: "Attacks whoever is touching the egg clutch." },
      ),
      [mover(0, 0, { max: 34 }), ally("clutch", "Egg Clutch", 1, 3, { max: 10 }), tamsin(1, 0, { hp: 10 }), brannoch(2, 3)],
    ),
    good: [hit("Talons", "brannoch")],
    bad: [hit("Talons", "tamsin")],
    why: "Brannoch is the one touching the clutch; the hurt cleric beside the warden is not.",
  },
  {
    id: "coward-keeps-its-distance-note",
    tags: ["trained", "controller", "ranged", "melee", "note"],
    setup: "A hexcaller whose note says it keeps well away from every enemy and never fights in melee. Brannoch and Ysolde are thirty feet off.",
    fight: fight(
      withTactics(HEXCALLER, { note: "A coward at heart: it never fights in melee and keeps well away from every enemy." }),
      [mover(0, 0, { max: 30 }), brannoch(6, 0), ysolde(6, 2)],
    ),
    good: [hit("Bolt", "ysolde"), hit("Bolt", "brannoch")],
    bad: [hit("Spiteful Rap", "brannoch"), hit("Spiteful Rap", "ysolde")],
    why: "The bolt keeps it away from them; the rap means walking into melee, which the note forbids.",
  },
  {
    id: "surrounded-note-bolts",
    tags: ["tactical", "brute", "melee", "note"],
    setup: "A raider at full strength whose note says it will not be surrounded: it breaks away as soon as two enemies are next to it. Brannoch and Tamsin are both beside it.",
    fight: fight(
      withTactics(RAIDER, { note: "Hates being surrounded: as soon as two enemies are next to it, it breaks away rather than fight on." }),
      [mover(0, 0, { max: 45 }), brannoch(1, 0), tamsin(0, 1)],
    ),
    good: ["disengage", "flee"],
    bad: [hit("Blade", "brannoch"), hit("Blade", "tamsin")],
    why: "Two enemies are beside it, so by its own note it leaves rather than strikes.",
  },
];
