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

describe("EntityEditorActionBar manual save mode", () => {
  const stubs = { AudienceRevealControl: true };
  const button = (wrapper: ReturnType<typeof mount>, label: string) =>
    wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!;

  it("will not save what cannot be saved, nor while it is already saving", async () => {
    const blocked = mount(EntityEditorActionBar, { props: { ...base, canSave: false }, global: { stubs } });
    expect(button(blocked, "Save").props("disabled")).toBe(true);

    const busy = mount(EntityEditorActionBar, { props: { ...base, saving: true }, global: { stubs } });
    expect(button(busy, "Saving…").props("disabled")).toBe(true);

    const ready = mount(EntityEditorActionBar, { props: base, global: { stubs } });
    expect(button(ready, "Save").props("disabled")).toBe(false);
    await button(ready, "Save").trigger("click");
    expect(ready.emitted("save")).toHaveLength(1);
  });

  it("a new record offers Create (or the caller's word) and has no Cancel or Delete to act on", () => {
    const fresh = mount(EntityEditorActionBar, { props: { ...base, exists: false }, global: { stubs } });
    expect(labels(fresh)).toEqual(["Create"]);
    const named = mount(EntityEditorActionBar, { props: { ...base, exists: false, createLabel: "Add monster" }, global: { stubs } });
    expect(labels(named)).toEqual(["Add monster"]);
  });

  it("hideCancel drops Cancel but keeps Save and Delete", () => {
    const wrapper = mount(EntityEditorActionBar, { props: { ...base, hideCancel: true }, global: { stubs } });
    expect(labels(wrapper)).toEqual(["Save", "Delete"]);
  });

  it("Delete is locked and reads Deleting… while the delete runs, and emits when pressed otherwise", async () => {
    const busy = mount(EntityEditorActionBar, { props: { ...base, deleting: true }, global: { stubs } });
    expect(button(busy, "Deleting…").props("disabled")).toBe(true);

    const idle = mount(EntityEditorActionBar, { props: base, global: { stubs } });
    await button(idle, "Delete").trigger("click");
    expect(idle.emitted("delete")).toHaveLength(1);
  });

  it("Cancel emits cancel", async () => {
    const wrapper = mount(EntityEditorActionBar, { props: base, global: { stubs } });
    await button(wrapper, "Cancel").trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("typing in the title field emits update:title", async () => {
    const wrapper = mount(EntityEditorActionBar, { props: base, global: { stubs } });
    await wrapper.get("input").setValue("Longer name");
    expect(wrapper.emitted("update:title")).toEqual([["Longer name"]]);
  });

  it("shows the audience control only for a record that has an audience, even an empty one", () => {
    expect(mount(EntityEditorActionBar, { props: base, global: { stubs } }).findComponent({ name: "AudienceRevealControl" }).exists()).toBe(false);
    expect(mount(EntityEditorActionBar, { props: { ...base, visibleTo: [] }, global: { stubs } }).findComponent({ name: "AudienceRevealControl" }).exists()).toBe(true);
  });

  it("shows an error under the bar", () => {
    expect(mount(EntityEditorActionBar, { props: { ...base, error: "Name taken" }, global: { stubs } }).text()).toContain("Name taken");
  });
});
