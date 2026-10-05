// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import LevelUpSubclassPicker from "@/levelup/LevelUpSubclassPicker.vue";

const base = { selectedId: "", nextLevel: 3, className: "Fighter" };

describe("LevelUpSubclassPicker", () => {
  it("says plainly that the table has no subclasses, and offers no free-text box", () => {
    const wrapper = mount(LevelUpSubclassPicker, { props: { ...base, subclassOptions: [] } });
    expect(wrapper.text()).toContain("This table has no subclasses for Fighter yet.");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find("select").exists()).toBe(false);
  });

  it("lists the table's subclass definitions and emits the id with its name", async () => {
    const wrapper = mount(LevelUpSubclassPicker, {
      props: { ...base, subclassOptions: [{ id: "def-1", name: "Champion", label: "Champion (custom)" }] },
    });
    expect(wrapper.text()).not.toContain("no subclasses");
    await wrapper.find("select").setValue("def-1");
    expect(wrapper.emitted("update:selectedId")?.[0]).toEqual(["def-1"]);
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["Champion"]);
  });
});
