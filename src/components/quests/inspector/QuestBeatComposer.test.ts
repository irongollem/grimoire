import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestBeatComposer from "./QuestBeatComposer.vue";

// The composer is a dialog; its panel is teleported, so it is drawn in place here.
const global = { stubs: { teleport: true } };

describe("QuestBeatComposer", () => {
  // Fails if an untitled beat can be submitted, or the dialog cannot be closed without creating one.
  it("refuses an untitled beat and closes without creating one", async () => {
    const wrapper = mount(QuestBeatComposer, { props: { sourceBeatId: "source" }, global });
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();
    await wrapper.findAll("button").find((button) => button.text() === "Cancel")!.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  // Fails if a beat with a source loses its route, or one without a source invents one.
  it("submits the trimmed title and kind, with a choice route when it follows a beat", async () => {
    const after = mount(QuestBeatComposer, { props: { sourceBeatId: "source" }, global });
    await after.get('input[aria-label="Beat title"]').setValue("  The bargain  ");
    await after.get("select").setValue("social");
    await after.get("form").trigger("submit");
    expect(after.emitted("submit")?.[0]?.[0]).toEqual({ title: "The bargain", kind: "social", route: { kind: "choice", label: null } });

    const alone = mount(QuestBeatComposer, { global });
    await alone.get('input[aria-label="Beat title"]').setValue("Opening");
    await alone.get("form").trigger("submit");
    expect(alone.emitted("submit")?.[0]?.[0]).toEqual({ title: "Opening", kind: "neutral" });
  });

  // Fails if "And also" can be picked for a beat with no other way out, which would strand its thread.
  it("greys out And also until the source has another route", () => {
    const wrapper = mount(QuestBeatComposer, { props: { sourceBeatId: "source", canBeParallel: false }, global });
    const also = wrapper.findAll("button").find((button) => button.text() === "And also")!;
    expect(also.attributes("disabled")).toBeDefined();
  });

  // Fails if an and-also route can be created without the label that names its thread, or keeps its spaces.
  it("needs a label for And also and sends it trimmed", async () => {
    const wrapper = mount(QuestBeatComposer, { props: { sourceBeatId: "source", canBeParallel: true }, global });
    await wrapper.findAll("button").find((button) => button.text() === "And also")!.trigger("click");
    await wrapper.get('input[aria-label="Beat title"]').setValue("Rumour");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")).toBeUndefined();
    await wrapper.get('input[aria-label="What the party does"]').setValue("  The Drowned Vault  ");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toEqual({ title: "Rumour", kind: "neutral", route: { kind: "parallel", label: "The Drowned Vault" } });
  });
});
