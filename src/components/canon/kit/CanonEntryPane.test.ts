import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CanonEntryPane from "./CanonEntryPane.vue";

const slots = { title: "<input data-testid='title' />", who: "<span data-testid='who'>arc</span>", default: "<p data-testid='text'>text</p>", connections: "<div data-testid='conn' />" };
const mountPane = (props: { deleteLabel?: string } = {}) => mount(CanonEntryPane, { props: { kind: "Truth", closeLabel: "Close this truth", ...props }, slots });

describe("CanonEntryPane", () => {
  // Bug caught: an entry reading in a different order from chapter to chapter (connections above the text, who below it).
  it("reads head, who, text, connections, then the footer", () => {
    const html = mountPane({ deleteLabel: "Delete this truth" }).html();
    const order = ["Truth", "data-testid=\"title\"", "data-testid=\"who\"", "data-testid=\"text\"", "data-testid=\"conn\"", "Delete this truth"].map((m) => html.indexOf(m));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  // Bug caught: close and delete wired to nothing, or to each other.
  it("closes and deletes through their own buttons", async () => {
    const w = mountPane({ deleteLabel: "Delete this truth" });
    expect(w.get("[data-testid=canon-entry-close]").attributes("aria-label")).toBe("Close this truth");
    await w.get("[data-testid=canon-entry-close]").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
    expect(w.emitted("delete")).toBeUndefined();
    await w.get("[data-testid=canon-entry-delete]").trigger("click");
    expect(w.emitted("delete")).toHaveLength(1);
  });

  // Bug caught: a backstory (never deleted from here) wearing a Delete it cannot honour.
  it("has no footer without a deleteLabel", () => {
    expect(mountPane().find("[data-testid=canon-entry-delete]").exists()).toBe(false);
  });
});
