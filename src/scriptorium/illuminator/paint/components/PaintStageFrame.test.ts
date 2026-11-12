// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PaintStageFrame from "./PaintStageFrame.vue";

const slot = { default: '<canvas data-testid="the-stage" />' };

describe("the painting frame", () => {
  // Fails if the stage is offered before the session is ready (a stroke would go nowhere, silently), or if nothing
  // tells the DM why the pen does nothing.
  it("shows a loading flag and no stage until ready, then the stage", async () => {
    const w = mount(PaintStageFrame, { props: { ready: false }, slots: slot });
    expect(w.find("[data-testid='the-stage']").exists()).toBe(false);
    expect(w.find("[data-testid='paint-loading']").text()).toContain("Getting the brushes ready");
    await w.setProps({ ready: true });
    expect(w.find("[data-testid='the-stage']").exists()).toBe(true);
    expect(w.find("[data-testid='paint-loading']").exists()).toBe(false);
  });

  // Fails if a failure to start looks like endless loading.
  it("says why painting could not start", () => {
    const w = mount(PaintStageFrame, { props: { ready: false, message: "Painting could not start. Try again." }, slots: slot });
    expect(w.find("[role='alert']").text()).toContain("could not start");
    expect(w.find("[data-testid='paint-loading']").exists()).toBe(false);
  });
});
