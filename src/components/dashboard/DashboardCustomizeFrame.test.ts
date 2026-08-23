import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import DashboardCustomizeFrame from "./DashboardCustomizeFrame.vue";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard/widgetCatalog";
import type { DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";
import type { DashboardWidgetDef } from "@/lib/dashboard/widgetCatalog";

const widgetById = new Map<string, DashboardWidgetDef>(
  DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]),
);

// `quests` supports all three widths — the multi-width fixture.
const QUESTS = widgetById.get("quests");
if (!QUESTS) throw new Error("fixture widget 'quests' missing from DASHBOARD_WIDGETS");

// `party` is full-width only — the single-width fixture.
const PARTY = widgetById.get("party");
if (!PARTY) throw new Error("fixture widget 'party' missing from DASHBOARD_WIDGETS");

// `recent-npcs` is one of the three self-hiding widgets.
const RECENT_NPCS = widgetById.get("recent-npcs");
if (!RECENT_NPCS) throw new Error("fixture widget 'recent-npcs' missing from DASHBOARD_WIDGETS");

// `dm-screen-card` is the first widget with per-instance settings (#764).
const DM_SCREEN = widgetById.get("dm-screen-card");
if (!DM_SCREEN) throw new Error("fixture widget 'dm-screen-card' missing from DASHBOARD_WIDGETS");

const entryFor = (widget: DashboardWidgetDef): DashboardLayoutEntry => ({
  key: widget.id,
  id: widget.id,
  width: widget.defaultWidth,
});

const CONTENT_SLOT = "<div>Widget body</div>";
// A real widget's `v-if="false"` root, compiled by @vue/test-utils' own
// compiler rather than returned as a bare null — the whole point of this
// fixture is that it produces the same comment vnode a self-hiding widget's
// slot actually leaves behind.
const EMPTY_SLOT = '<div v-if="false">Widget body</div>';

describe("not customizing", () => {
  // If this regresses, every ordinary dashboard render (i.e. every DM who
  // never opens Customize mode) gains an extra wrapping <div> around each
  // widget — invisible in a screenshot, but it changes flex/grid sizing and
  // breaks the "byte-identical to today" guarantee the story requires.
  it("renders only the slot, with no wrapper element and no controls", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS },
      slots: { default: CONTENT_SLOT },
    });
    expect(wrapper.html()).toBe("<div>Widget body</div>");
    expect(wrapper.find(".dashboard-customize-grip").exists()).toBe(false);
    expect(wrapper.findAll("button")).toHaveLength(0);
  });

  // `customizing` defaults to false — a caller that forgets to pass it must not
  // accidentally leave the DM stuck in an overlay they cannot see was optional.
  it("defaults to not customizing when the prop is omitted", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS },
      slots: { default: CONTENT_SLOT },
    });
    expect(wrapper.find(".dashboard-customize-grip").exists()).toBe(false);
  });
});

describe("customizing — controls", () => {
  // The grip is the one control every widget must get, and it is what the
  // drag container's Sortable `handle` option selects by class — if this
  // class disappears, dragging silently stops working app-wide even though
  // nothing throws.
  it("always renders a focusable grip carrying the sortable handle class", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    const grip = wrapper.get(".dashboard-customize-grip");
    expect(grip.element.tagName).toBe("BUTTON");
  });

  // A widget offered at three widths gets a control that names the width it
  // is at right now, so pressing it is not a guess.
  it("shows a width control labelled with the current width for a multi-width widget", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    expect(wrapper.text()).toContain("Cell");
  });

  // A single-width widget (party is full-width only) has no cycle to offer —
  // rendering the control anyway would be a button that visibly does nothing,
  // which the story calls out as worse than no button at all.
  it("omits the width control entirely for a single-width widget", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(PARTY), widget: PARTY, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    expect(wrapper.findAll("button")).toHaveLength(2); // grip + remove only
  });

  // Wording matters here specifically because nothing is destroyed — a
  // "delete"-flavoured name would train the DM to expect data loss on every
  // click, which is not what this control does.
  it("gives the remove control an accessible name that does not say delete", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    const remove = wrapper.get('[aria-label="Remove from dashboard"]');
    expect(remove.attributes("aria-label")?.toLowerCase()).not.toContain("delete");
  });
});

describe("customizing — emitted intent", () => {
  it("emits cycle-width with the entry's key, and nothing else, on click", async () => {
    const entry = entryFor(QUESTS);
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry, widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    await wrapper.get('[aria-label^="Change width"]').trigger("click");
    expect(wrapper.emitted("cycle-width")).toEqual([[entry.key]]);
    expect(wrapper.emitted("move")).toBeUndefined();
    expect(wrapper.emitted("remove")).toBeUndefined();
  });

  it("emits remove with the entry's key, and nothing else, on click", async () => {
    const entry = entryFor(QUESTS);
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry, widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    await wrapper.get('[aria-label="Remove from dashboard"]').trigger("click");
    expect(wrapper.emitted("remove")).toEqual([[entry.key]]);
    expect(wrapper.emitted("move")).toBeUndefined();
    expect(wrapper.emitted("cycle-width")).toBeUndefined();
  });

  // The four arrow keys are the entire keyboard reordering path — a DM who
  // cannot use a mouse has no other way to move a widget, so each direction
  // has to map to the correct sign.
  it("moves left/up by -1 and right/down by 1 from the focused grip", async () => {
    const entry = entryFor(QUESTS);
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry, widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    const grip = wrapper.get(".dashboard-customize-grip");
    await grip.trigger("keydown", { key: "ArrowUp" });
    await grip.trigger("keydown", { key: "ArrowLeft" });
    await grip.trigger("keydown", { key: "ArrowDown" });
    await grip.trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("move")).toEqual([
      [entry.key, -1],
      [entry.key, -1],
      [entry.key, 1],
      [entry.key, 1],
    ]);
  });

  // Delete/Backspace on the grip is the keyboard equivalent of the remove
  // button — losing this would strand a keyboard-only DM with no way to send
  // a widget back to the shelf at all.
  it("emits remove on Delete or Backspace from the focused grip", async () => {
    const entry = entryFor(QUESTS);
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry, widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    const grip = wrapper.get(".dashboard-customize-grip");
    await grip.trigger("keydown", { key: "Delete" });
    await grip.trigger("keydown", { key: "Backspace" });
    expect(wrapper.emitted("remove")).toEqual([[entry.key], [entry.key]]);
  });

  // An unrelated key (e.g. Tab, moving focus off the grip) must fall through
  // untouched — preventDefault-ing every keystroke on the grip would trap
  // keyboard focus inside the overlay.
  it("ignores keys it does not own", async () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    const grip = wrapper.get(".dashboard-customize-grip");
    await grip.trigger("keydown", { key: "Tab" });
    expect(wrapper.emitted("move")).toBeUndefined();
    expect(wrapper.emitted("remove")).toBeUndefined();
    expect(wrapper.emitted("cycle-width")).toBeUndefined();
  });
});

describe("customizing — configurable widgets", () => {
  // The gear is the only route to a widget's settings, and it exists solely
  // for widgets that declare `configurable`. On anything else it would open a
  // dialog with nothing in it.
  it("offers a gear only for a configurable widget", () => {
    const configurable = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(DM_SCREEN), widget: DM_SCREEN, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    expect(configurable.find('[aria-label^="Configure"]').exists()).toBe(true);

    const plain = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    expect(plain.find('[aria-label^="Configure"]').exists()).toBe(false);
  });

  it("emits the instance key, not the widget id", async () => {
    const entry: DashboardLayoutEntry = { key: "dm-screen-card-3", id: "dm-screen-card", width: "cell" };
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry, widget: DM_SCREEN, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    await wrapper.get('[aria-label^="Configure"]').trigger("click");
    expect(wrapper.emitted("configure")).toEqual([["dm-screen-card-3"]]);
  });

  // Remove is destructive and must stay last, whatever else joins the pill.
  it("keeps the remove control last in the pill", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(DM_SCREEN), widget: DM_SCREEN, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    const labels = wrapper.findAll("button").map((b) => b.attributes("aria-label"));
    expect(labels.at(-1)).toBe("Remove from dashboard");
  });
});

describe("customizing — self-hiding widgets", () => {
  // This is the case the whole placeholder exists for: without it, a DM who
  // opens Customize mode while no encounter is running sees nothing where
  // LiveEncounterBanner/RecentNpcsWidget/PinnedNotesWidget sit and has no way
  // to grab or resize them.
  // Awaited because emptiness is measured from the rendered DOM after mount,
  // not guessed from the slot's vnodes — see the component for why vnodes
  // cannot answer this question.
  it("shows a placeholder naming the widget when the slot renders nothing", async () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(RECENT_NPCS), widget: RECENT_NPCS, customizing: true },
      slots: { default: EMPTY_SLOT },
    });
    await nextTick();
    expect(wrapper.text()).toContain(RECENT_NPCS.title);
    expect(wrapper.text()).toContain(RECENT_NPCS.description);
    expect(wrapper.text()).not.toContain("Widget body");
  });

  // A self-hiding widget that currently *does* have data must keep showing
  // it while customizing — gating the placeholder on `selfHiding` instead of on
  // the slot's real output would hide live content the DM needs to see the
  // true size of.
  it("renders the real content instead of the placeholder when the slot is not empty", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(RECENT_NPCS), widget: RECENT_NPCS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    expect(wrapper.text()).toContain("Widget body");
    expect(wrapper.text()).not.toContain(RECENT_NPCS.description);
  });

  // THE case the first implementation got wrong while its tests stayed green.
  // A self-hiding widget is a *component* whose own root is v-if-ed away, so
  // the comment node lives inside that component's render and the slot vnode
  // here is an ordinary component vnode. Inspecting vnodes reports it as
  // non-empty and the placeholder never appears — which is exactly how the
  // real dashboard uses this, and exactly what no v-if-on-the-slot-root test
  // can catch.
  it("shows the placeholder when the slot holds a component that renders nothing", async () => {
    const SelfHidingWidget = defineComponent({
      name: "SelfHidingWidget",
      setup: () => () => null,
    });
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(RECENT_NPCS), widget: RECENT_NPCS, customizing: true },
      slots: { default: () => h(SelfHidingWidget) },
    });
    await nextTick();
    expect(wrapper.text()).toContain(RECENT_NPCS.title);
  });

  // A widget that never hides (quests always renders its DashboardWidget
  // shell) must never show the placeholder just because customizing is on.
  it("never shows the placeholder for a widget whose slot has content", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS, customizing: true },
      slots: { default: CONTENT_SLOT },
    });
    expect(wrapper.text()).not.toContain(QUESTS.description);
  });

  // `inheritAttrs` is off for the fragment branch, which also silences the
  // class the view uses to set a widget's grid span. Forwarding it by hand is
  // the only thing making the width control visibly do anything.
  it("forwards the grid-span class onto the customizing root", () => {
    const wrapper = mount(DashboardCustomizeFrame, {
      props: { entry: entryFor(QUESTS), widget: QUESTS, customizing: true },
      attrs: { class: "lg:col-span-2" },
      slots: { default: CONTENT_SLOT },
    });
    expect(wrapper.classes()).toContain("lg:col-span-2");
  });
});
