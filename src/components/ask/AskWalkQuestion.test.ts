// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { WalkStepId } from "@/lib/canon/canonWalk";
import AskWalkQuestion from "./AskWalkQuestion.vue";

function question(step: WalkStepId, answered = false) {
  return mount(AskWalkQuestion, {
    props: { item: { kind: "walk-question", id: 1, stop: { step, memberId: null, memberName: null }, text: "Q?", answered } },
  });
}
const chips = (w: ReturnType<typeof question>) => ({ decide: w.find("[data-testid=walk-decide]").exists(), skip: w.find("[data-testid=walk-skip-question]").exists() });

describe("AskWalkQuestion", () => {
  // Bug caught: the pitch skippable (every draft is written from it); You decide on the pitch (with no words the helper
  // offers the walk's own steer as the pitch); or a step with a draft offering no You decide.
  it("offers both chips on a section with a draft, and neither on the pitch", () => {
    expect(chips(question("voice"))).toEqual({ decide: true, skip: true });
    expect(chips(question("pitch"))).toEqual({ decide: false, skip: false });
  });

  // Bug caught: You decide on lore (nothing to title it from) or on habitats (no draft exists to run).
  it.each<WalkStepId>(["lore", "habitats"])("withholds You decide on %s but still lets it be skipped", (step) => {
    expect(chips(question(step))).toEqual({ decide: false, skip: true });
  });

  // Bug caught: chips pressable after the DM has answered, starting a second answer on a closed question.
  it("goes quiet once answered", () => {
    expect(chips(question("voice", true))).toEqual({ decide: false, skip: false });
  });

  // Bug caught: a follow-up still offering You decide (the DM has already said something to draft from), or no way to
  // stop being asked; or the pitch's follow-up skippable.
  it("offers Just give me ideas and Skip on a follow-up, and no Skip on the pitch's", () => {
    const followUp = (step: WalkStepId) => mount(AskWalkQuestion, { props: { item: { kind: "walk-question", id: 1, stop: { step, memberId: null, memberName: null }, text: "Q?", answered: false, followUp: true } } });
    const seen = (w: ReturnType<typeof followUp>) => ({ ideas: w.find("[data-testid=walk-ideas]").exists(), decide: w.find("[data-testid=walk-decide]").exists(), skip: w.find("[data-testid=walk-skip-question]").exists() });
    expect(seen(followUp("voice"))).toEqual({ ideas: true, decide: false, skip: true });
    expect(seen(followUp("pitch"))).toEqual({ ideas: true, decide: false, skip: false });
  });

  it("emits ideas from a follow-up", async () => {
    const w = mount(AskWalkQuestion, { props: { item: { kind: "walk-question", id: 1, stop: { step: "voice", memberId: null, memberName: null }, text: "Q?", answered: false, followUp: true } } });
    await w.get("[data-testid=walk-ideas]").trigger("click");
    expect(w.emitted("ideas")).toHaveLength(1);
  });

  it("emits decide and skip", async () => {
    const w = question("voice");
    await w.get("[data-testid=walk-decide]").trigger("click");
    await w.get("[data-testid=walk-skip-question]").trigger("click");
    expect(w.emitted("decide")).toHaveLength(1);
    expect(w.emitted("skip")).toHaveLength(1);
  });

  // Bug caught: the eyebrow counting from the wrong stop, or not naming the character.
  it("names the section and its place in the walk", () => {
    const stops = [{ step: "pitch", memberId: null, memberName: null }, { step: "voice", memberId: null, memberName: null }] as const;
    const w = mount(AskWalkQuestion, {
      props: { item: { kind: "walk-question", id: 1, stop: stops[1], text: "Q?", answered: false }, progress: stops },
    });
    expect(w.get("[data-testid=walk-eyebrow]").text()).toBe("Voice · 2 of 2");
  });
});
