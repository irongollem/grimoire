import { describe, expect, it } from "vitest";
import { planReveals } from "./reveals";

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
