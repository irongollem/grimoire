import { describe, expect, it } from "vitest";
import { planPlaceShare, planReveals } from "./reveals";

const ROSIE = "rosie";
const OTHER = "fresco";

describe("planReveals", () => {
  it("shows the place the party stands in to the played character, with its description", () => {
    const plan = planReveals({ memberId: ROSIE, place: { id: "cellar", visibleTo: [], descriptionShared: false }, characters: [] });
    expect(plan.place).toEqual({ id: "cellar", visibleTo: [ROSIE], shareDescription: true });
  });

  it("keeps everyone the place was already shown to, so arriving never takes it away from another player", () => {
    const plan = planReveals({ memberId: ROSIE, place: { id: "cellar", visibleTo: [OTHER], descriptionShared: true }, characters: [] });
    expect(plan.place?.visibleTo).toEqual([OTHER, ROSIE]);
  });

  it("shares the description of a place the character could already see but not read about", () => {
    const plan = planReveals({ memberId: ROSIE, place: { id: "cellar", visibleTo: [ROSIE], descriptionShared: false }, characters: [] });
    expect(plan.place).toEqual({ id: "cellar", visibleTo: [ROSIE], shareDescription: true });
  });

  it("writes nothing for a room and people the character already knows, so an ordinary turn costs no write", () => {
    const plan = planReveals({
      memberId: ROSIE,
      place: { id: "cellar", visibleTo: [ROSIE], descriptionShared: true },
      characters: [{ id: "honeycomb", visibleTo: [OTHER, ROSIE] }],
    });
    expect(plan).toEqual({ place: null, characters: [] });
  });

  it("shows a person who spoke to the played character and to nobody else in the party", () => {
    const plan = planReveals({
      memberId: ROSIE,
      place: null,
      characters: [{ id: "honeycomb", visibleTo: [] }, { id: "cantor", visibleTo: [OTHER] }, { id: "ribbon", visibleTo: [ROSIE] }],
    });
    expect(plan.characters).toEqual([{ id: "honeycomb", visibleTo: [ROSIE] }, { id: "cantor", visibleTo: [OTHER, ROSIE] }]);
  });

  it("reveals no place when the party has none", () => {
    expect(planReveals({ memberId: ROSIE, place: null, characters: [] })).toEqual({ place: null, characters: [] });
  });
});

describe("planPlaceShare", () => {
  const place = (over: Partial<{ visibleTo: string[]; descriptionShared: boolean; mapShared: boolean }> = {}) => ({ id: "hall", visibleTo: [] as string[], descriptionShared: false, mapShared: false, ...over });

  // Bug caught: handing a place over also handing the map over, whatever the story said.
  it("shares the place without its map unless the story gave the map", () => {
    expect(planPlaceShare({ memberId: ROSIE, place: place(), withMap: false })).toEqual({ id: "hall", patch: { player_visible_to: [ROSIE], is_description_shared: true } });
    expect(planPlaceShare({ memberId: ROSIE, place: place(), withMap: true })?.patch.is_map_shared).toBe(true);
  });

  // Bug caught: a map the DM already shares written again, or a place already known costing a write.
  it("writes only what is new", () => {
    const known = place({ visibleTo: [ROSIE, OTHER], descriptionShared: true, mapShared: true });
    expect(planPlaceShare({ memberId: ROSIE, place: known, withMap: true })).toBeNull();
    expect(planPlaceShare({ memberId: ROSIE, place: place({ visibleTo: [ROSIE], descriptionShared: true }), withMap: true })).toEqual({ id: "hall", patch: { is_map_shared: true } });
  });

  // Bug caught: another player's hold on the place dropped by handing it to this character.
  it("keeps whoever already holds the place", () => {
    expect(planPlaceShare({ memberId: ROSIE, place: place({ visibleTo: [OTHER] }), withMap: false })?.patch.player_visible_to).toEqual([OTHER, ROSIE]);
  });
});
