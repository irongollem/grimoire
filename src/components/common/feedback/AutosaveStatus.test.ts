import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AutosaveStatus from "./AutosaveStatus.vue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("AutosaveStatus", () => {
  // Fails if a form that only opened says "Saved", which reads as an accidental edit.
  it("says nothing for a form that is merely saved", () => {
    expect(mount(AutosaveStatus, { props: { status: "saved" } }).text()).toBe("");
  });

  // Fails if a save the DM caused goes unconfirmed, or the confirmation never fades.
  it("says Saved right after a save, then fades after five seconds", async () => {
    const wrapper = mount(AutosaveStatus, { props: { status: "saving" } });
    await wrapper.setProps({ status: "saved" });
    expect(wrapper.text()).toBe("Saved");
    vi.advanceTimersByTime(4900);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe("Saved");
    vi.advanceTimersByTime(200);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe("");
  });

  // Fails if Saved is said for a change that never went to the server (an edit undone back to saved).
  it("does not say Saved when an edit is undone before it was sent", async () => {
    const wrapper = mount(AutosaveStatus, { props: { status: "dirty" } });
    await wrapper.setProps({ status: "saved" });
    expect(wrapper.text()).toBe("");
  });
});
