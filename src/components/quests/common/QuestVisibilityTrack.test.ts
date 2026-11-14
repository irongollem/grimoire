import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import QuestVisibilityTrack from "./QuestVisibilityTrack.vue";

function buttons(w: ReturnType<typeof mount>) {
  return w.findAll("button");
}

describe("QuestVisibilityTrack", () => {
  it("emits nothing when a step below the floor is clicked", async () => {
    const w = mount(QuestVisibilityTrack, { props: { modelValue: "revealed", floor: "revealed" } });
    await buttons(w)[0]!.trigger("click");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("emits the step that is clicked when it is at or above the floor", async () => {
    const w = mount(QuestVisibilityTrack, { props: { modelValue: "rumored", floor: "rumored" } });
    await buttons(w)[2]!.trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([["revealed"]]);
  });

  it("does nothing when the current step is clicked", async () => {
    const w = mount(QuestVisibilityTrack, { props: { modelValue: "rumored" } });
    await buttons(w)[1]!.trigger("click");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("fills every step up to the current one", () => {
    const w = mount(QuestVisibilityTrack, { props: { modelValue: "rumored" } });
    expect(buttons(w).map((b) => b.get("span").classes().includes("bg-card"))).toEqual([false, false, true]);
  });

  it("marks only the current step pressed and disables steps under the floor", () => {
    const w = mount(QuestVisibilityTrack, { props: { modelValue: "rumored", floor: "rumored" } });
    expect(buttons(w).map((b) => b.attributes("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(buttons(w)[0]!.attributes("disabled")).toBeDefined();
    expect(buttons(w)[0]!.attributes("title")).toBe("One route away");
  });

  it("renders no buttons when static", () => {
    const w = mount(QuestVisibilityTrack, { props: { modelValue: "hidden", size: "xs" } });
    expect(w.findAll("button")).toHaveLength(0);
    expect(w.attributes("aria-label")).toBe("hidden");
  });
});
