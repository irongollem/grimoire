import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EntityEditorActionBar from "./EntityEditorActionBar.vue";

const base = { title: "Keep", exists: true, canSave: true };

function labels(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAllComponents({ name: "AppButton" }).map((b) => b.props("label"));
}

describe("EntityEditorActionBar autosave mode", () => {
  it("keeps Save and Cancel by default", () => {
    const wrapper = mount(EntityEditorActionBar, { props: base });
    expect(labels(wrapper)).toEqual(["Cancel", "Save", "Delete"]);
    expect(wrapper.findComponent({ name: "AutosaveStatus" }).exists()).toBe(false);
  });

  it("swaps Save for the status line and Cancel for Done", () => {
    const wrapper = mount(EntityEditorActionBar, {
      props: { ...base, autosave: { status: "saved", error: "" } },
    });
    expect(labels(wrapper)).toEqual(["Done", "Delete"]);
    expect(wrapper.text()).toContain("Saved");
  });

  it("shows the paused label and emits cancel from Done", async () => {
    const wrapper = mount(EntityEditorActionBar, {
      props: { ...base, autosave: { status: "paused", error: "", pausedLabel: "Needs a name" } },
    });
    expect(wrapper.text()).toContain("Needs a name");
    await wrapper.findAllComponents({ name: "AppButton" })[0]!.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
});
