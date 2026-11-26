// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AskComposer from "./AskComposer.vue";

describe("AskComposer", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the box keeping its generic line while the walk waits on an answer, so the DM is not told what is asked.
  it("shows the walk's line while one is given, and its own otherwise", () => {
    const own = mount(AskComposer).get("textarea").attributes("placeholder");
    expect(own).toMatch(/^Ask about your campaign/);
    const walk = mount(AskComposer, { props: { placeholder: "e.g. Dry and warm" } });
    expect(walk.get("textarea").attributes("placeholder")).toBe("e.g. Dry and warm");
  });
});
