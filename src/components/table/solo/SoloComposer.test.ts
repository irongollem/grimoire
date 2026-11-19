import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloComposer from "./SoloComposer.vue";

function mountComposer(props: { running?: boolean; canCorrect?: boolean; fight?: { yours: boolean; words: boolean; canAct: boolean } | null } = {}) {
  return mount(SoloComposer, { props: { character: "Inkling", running: false, ...props }, attachTo: document.body });
}

async function type(wrapper: ReturnType<typeof mountComposer>, text: string) {
  await wrapper.get("textarea").setValue(text);
}

const submits = (wrapper: ReturnType<typeof mountComposer>) => wrapper.emitted("submit") ?? [];

describe("SoloComposer", () => {
  // Bug caught: Enter inserting a newline instead of saying the line aloud.
  it("says on Enter", async () => {
    const w = mountComposer();
    await type(w, "Who are you?");
    await w.get("textarea").trigger("keydown", { key: "Enter" });
    expect(submits(w)).toEqual([["say", "Who are you?"]]);
  });

  // Bug caught: Alt+Enter treated like Enter, so a deed is said aloud (the player's box where there should be none).
  it("does on Alt+Enter", async () => {
    const w = mountComposer();
    await type(w, "I climb in.");
    await w.get("textarea").trigger("keydown", { key: "Enter", altKey: true });
    expect(submits(w)).toEqual([["do", "I climb in."]]);
  });

  // Bug caught: Shift+Enter sending, so a player cannot write two lines.
  it("does neither on Shift+Enter, and keeps what was typed", async () => {
    const w = mountComposer();
    await type(w, "one");
    await w.get("textarea").trigger("keydown", { key: "Enter", shiftKey: true });
    expect(submits(w)).toEqual([]);
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe("one");
  });

  // Bug caught: sending an empty line (a stray Enter) as a turn that costs credits.
  it("sends nothing when nothing is typed", async () => {
    const w = mountComposer();
    await type(w, "   ");
    await w.get("textarea").trigger("keydown", { key: "Enter" });
    expect(submits(w)).toEqual([]);
    // Go on is the one way to send nothing, and it is asked for by name.
    expect(w.findAll("button").filter((b) => b.attributes("data-testid") !== "solo-pass").every((b) => b.attributes("disabled") !== undefined)).toBe(true);
  });

  // Bug caught: no way to let the scene go on without inventing something to say; or the offer left up in a fight,
  // where it would spend the turn's deed on waiting.
  it("an empty box offers Go on, which passes; typing takes the offer away", async () => {
    const wrapper = mountComposer();
    await wrapper.get('[data-testid="solo-pass"]').trigger("click");
    expect(wrapper.emitted("pass")).toHaveLength(1);
    expect(wrapper.emitted("submit")).toBeUndefined();
    await wrapper.get("textarea").setValue("Hello");
    expect(wrapper.find('[data-testid="solo-pass"]').exists()).toBe(false);
  });

  it("a fight has no Go on: passing there is ending the turn on the board", () => {
    const wrapper = mountComposer({ fight: { yours: true, words: true, canAct: true } });
    expect(wrapper.find('[data-testid="solo-pass"]').exists()).toBe(false);
  });

  // Bug caught: the Say and Do buttons not sending the mode they are named for.
  it("the Say and Do buttons send their own mode", async () => {
    const w = mountComposer();
    await type(w, "Hello");
    await w.findAll("button").find((b) => b.text().startsWith("Do"))!.trigger("click");
    await type(w, "Again");
    await w.findAll("button").find((b) => b.text().startsWith("Say"))!.trigger("click");
    expect(submits(w)).toEqual([["do", "Hello"], ["say", "Again"]]);
  });

  describe("while a turn runs", () => {
    // Bug caught: a second voice at the table: Enter during an answer sending another turn.
    it("is locked: Enter sends nothing", async () => {
      const w = mountComposer({ running: true });
      await type(w, "talking over it");
      await w.get("textarea").trigger("keydown", { key: "Enter" });
      expect(submits(w)).toEqual([]);
      expect(w.get("textarea").attributes("readonly")).toBeDefined();
    });

    // Bug caught: Say and Do staying beside Stop, so there are three buttons and two of them dead.
    it("shows one Stop in place of Say and Do, and Stop asks to stop", async () => {
      const w = mountComposer({ running: true });
      const labels = w.findAll("button").map((b) => b.text());
      expect(labels).toEqual(["Stop"]);
      await w.get("button").trigger("click");
      expect(w.emitted("stop")).toHaveLength(1);
    });
  });
});

describe("SoloComposer in a fight", () => {
  const enter = (w: ReturnType<typeof mountComposer>, keys: Record<string, boolean> = {}) => w.get("textarea").trigger("keydown", { key: "Enter", ...keys });

  // Bug caught: the player talking and acting through the Dungeon Master while the creatures take their turns.
  it("takes no word and no deed when it is not your turn, and still takes a question", async () => {
    const w = mountComposer({ fight: { yours: false, words: true, canAct: true } });
    await type(w, "Stop!");
    await enter(w);
    await enter(w, { altKey: true });
    expect(submits(w)).toEqual([]);
    await enter(w, { ctrlKey: true });
    expect(submits(w)).toEqual([["ask", "Stop!"]]);
  });

  // Bug caught: a whole strategy discussed in a turn of six seconds.
  it("says a short line on your turn, and not one longer than a turn allows", async () => {
    const w = mountComposer({ fight: { yours: true, words: true, canAct: true } });
    // Twenty-one words: one over what fits in a turn.
    await type(w, "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone");
    await enter(w);
    expect(submits(w)).toEqual([]);
    await type(w, "Last chance, Sift. Hand it over.");
    await enter(w);
    expect(submits(w)).toEqual([["say", "Last chance, Sift. Hand it over."]]);
  });

  // Bug caught: a second speech in the same turn after the few words were spent.
  it("says nothing more once the turn's few words are spent, and can still do", async () => {
    const w = mountComposer({ fight: { yours: true, words: false, canAct: true } });
    await type(w, "And another thing");
    await enter(w);
    expect(submits(w)).toEqual([]);
    await enter(w, { altKey: true });
    expect(submits(w)).toEqual([["do", "And another thing"]]);
  });

  // Bug caught: a deed sent (and paid for in credits) when the turn has nothing left to pay for it.
  it("does nothing when the turn can no longer pay for a deed", async () => {
    const w = mountComposer({ fight: { yours: true, words: true, canAct: false } });
    await type(w, "I throw the chair");
    await enter(w, { altKey: true });
    expect(submits(w)).toEqual([]);
  });

  // Bug caught: no way back to a line just sent (a typo means typing it all again); or the arrows hijacked inside
  // a draft of several lines.
  it("brings back what was sent with the up arrow, and comes forward to the draft with the down arrow", async () => {
    const w = mountComposer();
    await type(w, "I search the shelves.");
    await w.get("textarea").trigger("keydown", { key: "Enter", altKey: true });
    await type(w, "half");
    await w.get("textarea").trigger("keydown", { key: "ArrowUp" });
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe("I search the shelves.");
    await w.get("textarea").trigger("keydown", { key: "ArrowDown" });
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe("half");
  });

  // #1021 row 23. Bug caught: a correction sent as something the character says aloud (the Enter that says a
  // line), so "she was only knocked out" is spoken into the room instead of becoming true.
  it("sends a correction, and only a correction, once the player says that is not what happened", async () => {
    const w = mountComposer({ canCorrect: true });
    await w.get('[data-testid="solo-correct"]').trigger("click");
    await type(w, "She was only knocked out.");
    await w.get("textarea").trigger("keydown", { key: "Enter" });
    expect(submits(w)).toEqual([["correct", "She was only knocked out."]]);
    // And the composer is back to the story: the next Enter says a line.
    await type(w, "Are you all right?");
    await w.get("textarea").trigger("keydown", { key: "Enter" });
    expect(submits(w)[1]).toEqual(["say", "Are you all right?"]);
  });

  // Bug caught: no way back out of a correction but sending one (a paid turn that rewrites the story by mistake).
  it("leaves the correction on Never mind or Escape without sending anything", async () => {
    const w = mountComposer({ canCorrect: true });
    await w.get('[data-testid="solo-correct"]').trigger("click");
    await type(w, "It never happened.");
    await w.get('[data-testid="solo-correct-cancel"]').trigger("click");
    expect(w.find('[data-testid="solo-correct-send"]').exists()).toBe(false);
    await w.get('[data-testid="solo-correct"]').trigger("click");
    await w.get("textarea").trigger("keydown", { key: "Escape" });
    expect(w.find('[data-testid="solo-correct-send"]').exists()).toBe(false);
    expect(submits(w)).toEqual([]);
  });

  // Bug caught: the way to a correction offered on an empty page, with nothing told yet to overrule.
  it("offers no correction before anything has been told", () => {
    expect(mountComposer().find('[data-testid="solo-correct"]').exists()).toBe(false);
  });
});
