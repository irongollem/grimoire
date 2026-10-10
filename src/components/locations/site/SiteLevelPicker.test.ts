import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SiteLevelPicker from "./SiteLevelPicker.vue";

const levels = [
  { id: "ws", name: "Master Nougatine's Locked Workshop" },
  { id: "f1", name: "First floor" },
  { id: "f2", name: "Second floor" },
];

describe("SiteLevelPicker", () => {
  it("numbers the levels from the site itself, as the Browse rail does", () => {
    const wrapper = mount(SiteLevelPicker, { props: { levels, activeId: "f1" } });
    expect(wrapper.findAll("option").map((o) => o.text())).toEqual([
      "1 · Master Nougatine's Locked Workshop",
      "2 · First floor",
      "3 · Second floor",
    ]);
    expect((wrapper.find("select").element as HTMLSelectElement).value).toBe("f1");
  });

  it("asks to switch to the chosen level, and not to the one already open", async () => {
    const wrapper = mount(SiteLevelPicker, { props: { levels, activeId: "f1" } });
    await wrapper.find("select").setValue("f2");
    expect(wrapper.emitted("select")).toEqual([["f2"]]);
    // The switch lands: Build navigates, and the open level is now f2.
    await wrapper.setProps({ activeId: "f2" });
    await wrapper.find("select").setValue("f2");
    expect(wrapper.emitted("select")).toEqual([["f2"]]);
  });

  it("offers the next level beside the list", async () => {
    const wrapper = mount(SiteLevelPicker, { props: { levels, activeId: "ws" } });
    const add = wrapper.find('button[aria-label="Add level 4"]');
    expect(add.exists()).toBe(true);
    await add.trigger("click");
    expect(wrapper.emitted("add")).toHaveLength(1);
  });

  it("is only an Add a level button while the site has no levels", async () => {
    const wrapper = mount(SiteLevelPicker, { props: { levels: [levels[0]!], activeId: "ws" } });
    expect(wrapper.find("select").exists()).toBe(false);
    const add = wrapper.findAll("button").find((b) => b.text().includes("Add a level"));
    expect(add).toBeDefined();
    await add!.trigger("click");
    expect(wrapper.emitted("add")).toHaveLength(1);
  });
});
