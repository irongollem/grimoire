import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import NpcAlterEgoControl from "./NpcAlterEgoControl.vue";

// Mounted into the real document, matching SegmentedControl's own test idiom —
// its buttons are reka-ui ToggleGroupItems that register focus/roving state
// against the live document.
const mounted: VueWrapper[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
});

function mountControl(revealed: boolean) {
  const w = mount(NpcAlterEgoControl, {
    props: { revealed },
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
}

describe("NpcAlterEgoControl", () => {
  it("shows Alter ego as the active option when not revealed", () => {
    const w = mountControl(false);
    const buttons = w.findAll("button");
    const alterEgo = buttons.find((b) => b.text() === "Alter ego");
    const trueForm = buttons.find((b) => b.text() === "True form");
    expect(alterEgo?.attributes("data-state")).toBe("on");
    expect(trueForm?.attributes("data-state")).toBe("off");
  });

  it("shows True form as the active option when revealed", () => {
    const w = mountControl(true);
    const buttons = w.findAll("button");
    const alterEgo = buttons.find((b) => b.text() === "Alter ego");
    const trueForm = buttons.find((b) => b.text() === "True form");
    expect(trueForm?.attributes("data-state")).toBe("on");
    expect(alterEgo?.attributes("data-state")).toBe("off");
  });

  it("emits change(true) when True form is clicked", async () => {
    const w = mountControl(false);
    const trueForm = w.findAll("button").find((b) => b.text() === "True form");
    await trueForm?.trigger("click");
    expect(w.emitted("change")).toEqual([[true]]);
  });

  it("emits change(false) when Alter ego is clicked", async () => {
    const w = mountControl(true);
    const alterEgo = w.findAll("button").find((b) => b.text() === "Alter ego");
    await alterEgo?.trigger("click");
    expect(w.emitted("change")).toEqual([[false]]);
  });
});
