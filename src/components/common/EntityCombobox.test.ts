import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EntityCombobox from "./EntityCombobox.vue";

const options = [
  { id: "a", name: "Alder" },
  { id: "b", name: "Birch" },
];

function mountBox(props: { modelValue: string; options: typeof options; selectedLabel?: string | null }) {
  return mount(EntityCombobox, {
    props,
    global: { stubs: { Teleport: true }, directives: { "no-pwm": {} } },
  });
}

const placeholderOf = (w: ReturnType<typeof mountBox>) => w.get("input").attributes("placeholder");

describe("EntityCombobox", () => {
  it("shows the selected option's name from options", () => {
    expect(placeholderOf(mountBox({ modelValue: "b", options }))).toBe("Birch");
  });

  it("falls back to the placeholder when nothing is selected", () => {
    expect(placeholderOf(mountBox({ modelValue: "", options, selectedLabel: "Ignored" }))).toBe("Search…");
  });

  it("shows selectedLabel while the selected id is not in options yet", () => {
    expect(placeholderOf(mountBox({ modelValue: "z", options: [], selectedLabel: "Zephyr" }))).toBe("Zephyr");
  });

  it("prefers the option's name over selectedLabel once options hold the id", () => {
    expect(placeholderOf(mountBox({ modelValue: "a", options, selectedLabel: "Stale" }))).toBe("Alder");
  });

  it("emits open each time the dropdown opens", async () => {
    const w = mountBox({ modelValue: "", options });
    await w.get("input").trigger("focus");
    expect(w.emitted("open")).toHaveLength(1);
    await w.get("input").trigger("keydown.escape");
    await w.get("input").trigger("focus");
    expect(w.emitted("open")).toHaveLength(2);
  });

  it("renders the hooks Vellum styles its field by", () => {
    const input = mountBox({ modelValue: "", options }).get("input");
    expect(input.attributes("data-field")).toBe("combobox");
    expect(input.attributes("data-field-size")).toBe("body");
    expect(input.attributes("data-field-tone")).toBe("card");
  });

  it("marks its open list as a floating slip", async () => {
    const w = mountBox({ modelValue: "", options });
    await w.get("input").trigger("focus");
    expect(w.find("ul[data-slip]").exists()).toBe(true);
  });
});
