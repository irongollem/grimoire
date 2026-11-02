import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import AppInput from "@/components/common/controls/AppInput.vue";
import CartographerGroundControls from "./CartographerGroundControls.vue";

function controls(over: Partial<InstanceType<typeof CartographerGroundControls>["$props"]> = {}) {
  return mount(CartographerGroundControls, {
    props: { selected: null, regionMode: "new", category: "floor", wallMode: "none", ...over },
  });
}

function button(wrapper: ReturnType<typeof controls>, label: string) {
  const found = wrapper.findAll("button").find((entry) => entry.text() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

describe("ground controls", () => {
  it("starts with a new floor-only shape, and Extend requires a selected shape", () => {
    const wrapper = controls();
    expect(button(wrapper, "New shape").attributes("aria-pressed")).toBe("true");
    expect(button(wrapper, "None").attributes("aria-pressed")).toBe("true");
    expect(button(wrapper, "Extend selected").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("Move through it and see across it");
  });

  it("names the exact selected target and keeps its material while extending", async () => {
    const wrapper = controls({ selected: { id: "oasis", name: "Water oasis" }, regionMode: "extend" });
    expect(wrapper.text()).toContain("Extending: Water oasis");
    expect(button(wrapper, "Extend selected").attributes("disabled")).toBeUndefined();
    expect(button(wrapper, "Floor").attributes("disabled")).toBeDefined();
    await button(wrapper, "New shape").trigger("click");
    expect(wrapper.emitted("update:regionMode")?.[0]).toEqual(["new"]);
  });

  it("explains that Extend needs a new target when undo removes the selected shape", async () => {
    const wrapper = controls({ selected: { id: "oasis", name: "Water oasis" }, regionMode: "extend" });
    await wrapper.setProps({ selected: null });
    expect(wrapper.text()).toContain("Select a shape to extend");
    expect(wrapper.text()).not.toContain("Extending: Water oasis");
    expect(button(wrapper, "Extend selected").attributes("disabled")).toBeDefined();
  });

  it("names the Alt subtraction target even while New shape is selected", () => {
    const wrapper = controls({ selected: { id: "oasis", name: "Water oasis" }, regionMode: "new" });
    expect(wrapper.text()).toContain("Selected: Water oasis. Alt cuts this shape.");
    expect(wrapper.text()).not.toContain("Extending:");
  });

  it("offers independent water and hidden wall choices with their effects stated", async () => {
    const wrapper = controls();
    await button(wrapper, "Water").trigger("click");
    expect(wrapper.emitted("update:category")?.[0]).toEqual(["terrainWater"]);
    await button(wrapper, "Hidden").trigger("click");
    expect(wrapper.emitted("update:wallMode")?.[0]).toEqual(["hidden"]);
    await wrapper.setProps({ wallMode: "hidden" });
    expect(wrapper.text()).toContain("An unseen wall that blocks sight and movement");
  });

  it("edits the selected shape's walls and offers shape deletion independently of Brush", async () => {
    const wrapper = controls({ editing: true, selected: { id: "oasis", name: "Water oasis" } });
    expect((wrapper.get('input[aria-label="Shape name"]').element as HTMLInputElement).value).toBe("Water oasis");
    expect(wrapper.text()).not.toContain("New shape");
    await button(wrapper, "Visible").trigger("click");
    expect(wrapper.emitted("update:wallMode")?.[0]).toEqual(["visible"]);
    await button(wrapper, "Delete shape").trigger("click");
    expect(wrapper.emitted("delete")).toHaveLength(1);
  });

  it("ignores an undefined input value instead of naming a region undefined", () => {
    const wrapper = controls({ editing: true, selected: { id: "oasis", name: "Water oasis" } });
    wrapper.getComponent(AppInput).vm.$emit("update:modelValue", undefined);
    expect(wrapper.emitted("update:name")).toBeUndefined();
  });

  it("shows no editing actions when its selected region disappears", () => {
    const wrapper = controls({ editing: true, selected: null });
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("renames the selected shape immediately without a save action", async () => {
    const wrapper = controls({ editing: true, selected: { id: "oasis", name: "Water oasis" } });
    await wrapper.get('input[aria-label="Shape name"]').setValue("Moonwell");
    expect(wrapper.emitted("update:name")?.at(-1)).toEqual(["Moonwell"]);
    expect(wrapper.text()).not.toContain("Save");
  });
});
