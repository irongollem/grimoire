import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DashboardShelf from "./DashboardShelf.vue";
import { DEFAULT_LAYOUTS, type DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";
import { DASHBOARD_WIDGETS, type DashboardWidgetId } from "@/lib/dashboard/widgetCatalog";
import { shelfWidgets } from "@/lib/dashboard/arrangeOps";

const prep = (): DashboardLayoutEntry[] =>
  DEFAULT_LAYOUTS.prep.widgets.map((entry) => ({ ...entry }));

interface ShelfOption {
  id: string;
  name: string;
  description: string;
  isNew: boolean;
  selfHiding: boolean;
  selfHidingNote: string;
}

function open(
  entries: DashboardLayoutEntry[],
  newWidgetIds: DashboardWidgetId[] = [],
) {
  return mount(DashboardShelf, {
    props: { entries, surface: "prep" as const, newWidgetIds },
  });
}

// Matched by name, not by the imported component: `EntityCombobox` is a
// `<script setup generic=...>` component, and VTU's `findComponent` overloads
// resolve a generic component to a DOMWrapper, which has no `props`/`vm`.
const comboboxOf = (wrapper: ReturnType<typeof open>) =>
  wrapper.findComponent({ name: "EntityCombobox" });

const optionsOf = (wrapper: ReturnType<typeof open>): ShelfOption[] =>
  comboboxOf(wrapper).props("options") as ShelfOption[];

describe("DashboardShelf", () => {
  // The picker is the only route to adding a widget, so what it offers has to
  // be exactly what the layout has room for — anything else either hides a
  // widget the DM wants or offers one that cannot be placed.
  it("offers exactly the widgets the layout has no room for", () => {
    const wrapper = open(prep());
    const expected = shelfWidgets(prep(), "prep").map((widget) => widget.id);
    expect(optionsOf(wrapper).map((option) => option.id)).toEqual(expected);
  });

  it("carries each widget's title and description into the option", () => {
    const first = optionsOf(open(prep()))[0];
    const widget = shelfWidgets(prep(), "prep")[0];
    expect(first?.name).toBe(widget?.title);
    expect(first?.description).toBe(widget?.description);
  });

  // Selecting is the act of adding, so the box has to empty itself — otherwise
  // it sits there naming a widget that is no longer in its own option list.
  it("emits add on selection and clears itself", async () => {
    const wrapper = open(prep());
    const combobox = comboboxOf(wrapper);
    combobox.vm.$emit("update:modelValue", "session");
    await nextTick();

    expect(wrapper.emitted("add")).toEqual([["session"]]);
    await nextTick();
    expect(combobox.props("modelValue")).toBe("");
  });

  // How a DM discovers a widget the catalogue grew after they last arranged
  // their screen. Without it, every future widget from #764 ships invisible.
  it("marks only the widgets the registry has newly gained", () => {
    const options = optionsOf(open(prep(), ["session"]));
    expect(options.find((option) => option.id === "session")?.isNew).toBe(true);
    expect(options.find((option) => option.id === "recent-npcs")?.isNew).toBe(false);
  });

  // Adding a self-hiding widget can look like nothing happened; the option has
  // to say why before the DM clicks it, not after.
  it("explains a self-hiding widget on its own option", () => {
    const options = optionsOf(open(prep()));
    const selfHiding = DASHBOARD_WIDGETS.filter(
      (widget) => widget.selfHiding && options.some((option) => option.id === widget.id),
    );
    expect(selfHiding.length).toBeGreaterThan(0);
    for (const widget of selfHiding) {
      const option = options.find((candidate) => candidate.id === widget.id);
      expect(option?.selfHiding).toBe(true);
      expect(option?.selfHidingNote).toContain("appears on its own");
    }
    expect(options.find((option) => option.id === "session")?.selfHiding).toBe(false);
  });

  // Says so rather than offering an empty picker, which reads as broken.
  it("says everything is placed when nothing is left to add", () => {
    // Every instance *slot*, not one per widget: `dm-screen-card` allows six.
    const everything = DASHBOARD_WIDGETS.filter((widget) =>
      widget.surfaces.includes("prep"),
    ).flatMap((widget) =>
      Array.from({ length: widget.maxInstances }, (_unused, n) => ({
        key: n === 0 ? widget.id : `${widget.id}-${n + 1}`,
        id: widget.id,
        width: widget.defaultWidth,
      })),
    );
    const wrapper = open(everything);
    expect(optionsOf(wrapper)).toEqual([]);
    expect(comboboxOf(wrapper).props("placeholder")).toContain(
      "Every widget is on your dashboard",
    );
  });

  // Offering a reset that would change nothing is a lie, and the DM cannot
  // tell from the grid alone whether their layout is still the stock one.
  it("disables reset only while the layout is already the default", async () => {
    const asDefault = open(prep());
    const resetOf = (wrapper: ReturnType<typeof open>) =>
      wrapper.findAllComponents({ name: "AppButton" }).find((button) =>
        button.props("label") === "Reset to default",
      );
    expect(resetOf(asDefault)?.props("disabled")).toBe(true);

    const customized = open(prep().filter((entry) => entry.key !== "stats"));
    const reset = resetOf(customized);
    expect(reset?.props("disabled")).toBe(false);

    await reset?.trigger("click");
    expect(customized.emitted("reset")).toHaveLength(1);
  });
});
