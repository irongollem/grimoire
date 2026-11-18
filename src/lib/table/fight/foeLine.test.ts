import { describe, expect, it } from "vitest";
import { afterFoeSpoke, foeMoment, FOE_NEVER_SEEN, NO_FOE_TALK, type FoeSeen, type FoeTurnSeen } from "./foeLine";

const turn = (over: Partial<FoeTurnSeen> = {}): FoeTurnSeen => ({
  instanceId: "m-ogre-0", speaks: true, round: 3, hp: 40, maxHp: 59, alliesStanding: 2,
  played: { hpBefore: 30, hpAfter: 30, maxHp: 40 }, defencesShown: { before: 0, after: 0 }, ...over,
});
const seen: FoeSeen = { hp: 40, alliesStanding: 2 };

describe("foeMoment", () => {
  // Bug caught: a foe that talks every turn (a credit a turn for "the goblin snarls"), which is the cost the
  // maintainer's helpers ran up before the quiet way.
  it("says nothing on a turn where nothing happened", () => {
    expect(foeMoment(turn(), seen, NO_FOE_TALK)).toBeNull();
  });

  // Bug caught: a wolf taunting after a hard bite (a paid line for a creature with no tongue), or foes still
  // talking after the player switched them off.
  it("gives no line to a creature that cannot speak, or when the player has switched foes' talk off", () => {
    const hard = turn({ played: { hpBefore: 30, hpAfter: 20, maxHp: 40 } });
    expect(foeMoment({ ...hard, speaks: false }, seen, NO_FOE_TALK)).toBeNull();
    expect(foeMoment(hard, seen, NO_FOE_TALK, false)).toBeNull();
  });

  // app convention: a quarter of the character's hit points in one turn is a hard blow.
  // Bug caught: the share measured against current instead of full hit points, so every scratch on a wounded
  // character is a taunt; or the boundary missed, so exactly a quarter says nothing.
  it("speaks after a hard blow, a quarter of the character's hit points or more", () => {
    expect(foeMoment(turn({ played: { hpBefore: 30, hpAfter: 20, maxHp: 40 } }), seen, NO_FOE_TALK)).toBe("hit_hard");
    expect(foeMoment(turn({ played: { hpBefore: 12, hpAfter: 3, maxHp: 40 } }), seen, NO_FOE_TALK)).toBeNull();
  });

  // Bug caught: dropping the character read as merely a hard blow, or a foe gloating over a character who was
  // already down before its turn.
  it("gloats when it puts the character down, and not over one already down", () => {
    expect(foeMoment(turn({ played: { hpBefore: 4, hpAfter: 0, maxHp: 40 }, alliesStanding: 1 }), seen, NO_FOE_TALK)).toBe("dropped_you");
    expect(foeMoment(turn({ played: { hpBefore: 0, hpAfter: 0, maxHp: 40 } }), seen, NO_FOE_TALK)).toBeNull();
  });

  // Bug caught: every foe mourning on its first turn (nothing seen yet reads as "everyone fell"), or crying out at
  // half its hit points again on every later turn.
  it("speaks when one of its side fell or it was brought below half since its last turn, once", () => {
    expect(foeMoment(turn({ alliesStanding: 1 }), seen, NO_FOE_TALK)).toBe("ally_fell");
    expect(foeMoment(turn({ hp: 29 }), seen, NO_FOE_TALK)).toBe("badly_hurt");
    expect(foeMoment(turn({ hp: 20 }), { hp: 25, alliesStanding: 2 }, NO_FOE_TALK)).toBeNull();
    expect(foeMoment(turn({ hp: 20, alliesStanding: 1 }), FOE_NEVER_SEEN, NO_FOE_TALK)).toBeNull();
  });

  // The maintainer: an enemy "can't know the player is resistant to something unless he learns that through events
  // or combat". Bug caught: the lesson learned in silence, when calling it out is how the foe's side hears of it.
  it("calls out a defence its target showed this turn", () => {
    expect(foeMoment(turn({ defencesShown: { before: 1, after: 2 } }), seen, NO_FOE_TALK)).toBe("learned");
  });

  // Bug caught: three goblins each taunting in one round (three paid turns), or the same ogre gloating round
  // after round.
  it("keeps to one line a round, and the same foe holds its tongue for two rounds after", () => {
    const hard = turn({ played: { hpBefore: 30, hpAfter: 20, maxHp: 40 } });
    const talk = afterFoeSpoke(NO_FOE_TALK, "m-goblin-1", 3);
    expect(foeMoment(hard, seen, talk)).toBeNull();
    const own = afterFoeSpoke(NO_FOE_TALK, "m-ogre-0", 1);
    expect(foeMoment(hard, seen, own)).toBeNull();
    expect(foeMoment({ ...hard, round: 4 }, seen, own)).toBe("hit_hard");
  });
});
