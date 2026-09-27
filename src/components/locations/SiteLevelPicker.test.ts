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
});
