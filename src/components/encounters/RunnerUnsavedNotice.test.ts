import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RunnerUnsavedNotice from "./RunnerUnsavedNotice.vue";

const notice = (unsent: number, failures: number) => mount(RunnerUnsavedNotice, { props: { unsent, failures } });

describe("RunnerUnsavedNotice", () => {
  it("fails if it flickers on an ordinary request in flight, before any send has failed", () => {
    expect(notice(2, 0).find("[role=status]").exists()).toBe(false);
  });

  it("fails if it stays on screen after everything is saved", () => {
    expect(notice(0, 3).find("[role=status]").exists()).toBe(false);
  });

  it("fails if it does not count the unsent changes once sending has failed, in the singular and the plural", () => {
    expect(notice(1, 1).text()).toBe("1 change is not saved yet. Trying again.");
    expect(notice(3, 2).text()).toBe("3 changes are not saved yet. Trying again.");
  });
});
