import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonRow from "./CanonRow.vue";

const row = (selected?: boolean) =>
  mount(CanonRow, { props: { id: "canon-entry-e1", label: "The Stain is a wound.", selected }, slots: { default: "<span>content</span>" } });

describe("CanonRow", () => {
  // Fails on: a selected row that looks like the rest, or one that does not tell a screen reader it is pressed.
  it("marks the selected row in style and in aria-pressed, and no other", () => {
    const on = row(true);
    expect(on.attributes("data-selected")).toBe("true");
    expect(on.classes()).toContain("bg-primary/10");
    expect(on.find("button").attributes("aria-pressed")).toBe("true");
    const off = row();
    expect(off.classes()).not.toContain("bg-primary/10");
    expect(off.find("button").attributes("aria-pressed")).toBe("false");
  });

  it("keeps the id the page scrolls to, shows its content, and names the button for the entry's words", () => {
    const w = row();
    expect(w.attributes("id")).toBe("canon-entry-e1");
    expect(w.text()).toBe("content");
    expect(w.find("button").attributes("aria-label")).toBe("The Stain is a wound.");
  });

  // Bug caught: a mark drawn over the stretched button, so a tap on the row's right edge selected nothing.
  it("draws the mark slot at the right edge without taking the row's taps", async () => {
    const w = mount(CanonRow, { props: { id: "r", label: "L" }, slots: { default: "<span>content</span>", mark: "<b>Secret</b>" } });
    const mark = w.get("[data-testid=row-mark]");
    expect(mark.text()).toBe("Secret");
    expect(mark.classes()).toContain("pointer-events-none");
    expect(mount(CanonRow, { props: { id: "r", label: "L" } }).find("[data-testid=row-mark]").exists()).toBe(false);
  });

  it("selects through its one button", async () => {
    const w = row();
    await w.find("button").trigger("click");
    expect(w.emitted("select")).toHaveLength(1);
  });
});
