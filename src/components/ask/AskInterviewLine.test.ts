// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AskInterviewLine from "./AskInterviewLine.vue";

describe("AskInterviewLine", () => {
  // Bug caught: Turn this into my canon pressable before the DM has told anything (an empty import).
  it("keeps Turn this into my canon disabled until something is told, and emits nothing for the press", async () => {
    const w = mount(AskInterviewLine, { props: { canTurn: false } });
    const turn = w.get("[data-testid=interview-turn]");
    expect(turn.attributes("disabled")).toBeDefined();
    await turn.trigger("click");
    expect(w.emitted("turn")).toBeUndefined();
  });

  // Bug caught: the two controls wired to each other's event.
  it("emits turn and leave from their own buttons", async () => {
    const w = mount(AskInterviewLine, { props: { canTurn: true } });
    await w.get("[data-testid=interview-turn]").trigger("click");
    expect(w.emitted("turn")).toHaveLength(1);
    expect(w.emitted("leave")).toBeUndefined();
    await w.get("[data-testid=interview-leave]").trigger("click");
    expect(w.emitted("leave")).toHaveLength(1);
  });
});
