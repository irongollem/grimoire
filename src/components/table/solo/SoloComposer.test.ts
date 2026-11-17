import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloComposer from "./SoloComposer.vue";

function mountComposer(props: { running?: boolean } = {}) {
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
    expect(w.findAll("button").every((b) => b.attributes("disabled") !== undefined)).toBe(true);
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
