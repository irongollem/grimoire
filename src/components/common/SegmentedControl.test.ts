import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import SegmentedControl from "./SegmentedControl.vue";

const OPTIONS = [
  { value: "url", label: "URL" },
  { value: "upload", label: "Upload" },
  { value: "browse", label: "Browse" },
] as const;

// These mount into the real document so focus assertions mean something, which
// makes teardown mandatory — a leftover group keeps its buttons in the page and
// steals the focus the next test is trying to observe.
const mounted: VueWrapper[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
});

function mountControl(modelValue = "url", extra: Record<string, unknown> = {}) {
  return mountWith(modelValue, [...OPTIONS], extra);
}

function mountWith(
  modelValue: string,
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>,
  extra: Record<string, unknown> = {},
) {
  const w = mount(SegmentedControl, {
    props: { modelValue, options: [...options], ...extra },
    attachTo: document.body,
  });
  // Every mount goes through here so the afterEach teardown above can reach it —
  // a wrapper that skips the array survives into the next test and steals focus.
  mounted.push(w);
  return w;
}

describe("SegmentedControl", () => {
  it("renders one button per option", () => {
    const w = mountControl();
    const buttons = w.findAll("button");
    expect(buttons).toHaveLength(3);
    expect(buttons.map(b => b.text())).toEqual(["URL", "Upload", "Browse"]);
  });

  it("marks only the selected option active", () => {
    const w = mountControl("upload");
    const buttons = w.findAll("button");
    expect(buttons[1].attributes("data-state")).toBe("on");
    expect(buttons[0].attributes("data-state")).toBe("off");
    expect(buttons[1].classes()).toContain("bg-primary/10");
    expect(buttons[0].classes()).not.toContain("bg-primary/10");
  });

  it("emits the new value on click", async () => {
    const w = mountControl("url");
    await w.findAll("button")[2].trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([["browse"]]);
  });

  // ToggleGroup lets you deselect the active item; a segmented picker must never
  // end up with nothing selected.
  it("ignores a click that would deselect the current option", async () => {
    const w = mountControl("url");
    await w.findAll("button")[0].trigger("click");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("does not emit for a disabled option", async () => {
    const w = mountWith("url", [
      { value: "url", label: "URL" },
      { value: "upload", label: "Upload", disabled: true },
    ]);
    await w.findAll("button")[1].trigger("click");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  // An option may legitimately BE the empty string — "General — all campaigns",
  // "All subraces". Treating an empty payload as ToggleGroup's deselect made those
  // options permanently unreachable: once you left them you could never come back.
  it("can select an option whose value is the empty string", async () => {
    const w = mountWith("campaign", [
      { value: "", label: "General — all campaigns" },
      { value: "campaign", label: "This campaign" },
    ]);
    await w.findAll("button")[0].trigger("click");
    expect(w.emitted("update:modelValue")).toEqual([[""]]);
  });

  // The reason for taking the reka-ui dependency: none of the hand-rolled toggle
  // rows this replaces had keyboard navigation. Roving focus means the *group* is
  // the single tab stop — items are -1 until one is entered, so the whole control
  // costs one Tab press instead of one per option.
  it("makes the group a single tab stop", async () => {
    const w = mountControl("url");
    // The group only becomes tabbable once its items have registered.
    await nextTick();
    expect(w.attributes("tabindex")).toBe("0");
    expect(w.findAll("button").map(b => b.attributes("tabindex"))).toEqual(["-1", "-1", "-1"]);
  });

  it("hands the tab stop to whichever item is focused", async () => {
    const w = mountControl("url");
    const buttons = w.findAll("button");
    await buttons[1].trigger("focus");
    expect(buttons[1].attributes("tabindex")).toBe("0");
    expect(buttons[0].attributes("tabindex")).toBe("-1");
  });

  it("moves focus with the arrow keys, wrapping at the end", async () => {
    const w = mountControl("url");
    // Items join the roving-focus collection on mount; without this tick the
    // keydown handler finds an empty candidate list and quietly does nothing.
    await nextTick();
    const buttons = w.findAll("button");

    // The handler defers focusFirst to nextTick, so the trigger's own flush is
    // not enough — hence the second tick.
    buttons[0].element.focus();
    await buttons[0].trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(buttons[1].element);

    buttons[2].element.focus();
    await buttons[2].trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(buttons[0].element);
  });

  it("divides the width evenly when block", () => {
    const w = mountControl("url", { block: true });
    expect(w.classes()).toContain("w-full");
    expect(w.findAll("button")[0].classes()).toContain("flex-1");
  });
});
