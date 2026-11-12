import { describe, expect, it } from "vitest";
import { tableRowsOf, withTableRows } from "./tableRows";

describe("tableRows", () => {
  // Fails on: choosing a row style wiping the classes print added (sc-table--long), or stacking striped on plain.
  it("swaps the row class and keeps every other class", () => {
    expect(withTableRows("sc-table--long sc-table--plain", "striped")).toBe("sc-table--long sc-table--striped");
    expect(withTableRows("sc-table--long sc-table--striped", "look")).toBe("sc-table--long");
  });

  // Fails on: "The look's" leaving an empty class attribute behind.
  it("clears the class entirely when nothing is left", () => {
    expect(withTableRows("sc-table--striped", "look")).toBeNull();
    expect(withTableRows(null, "look")).toBeNull();
  });

  // Fails on: the control showing The look's for a table already striped or plain.
  it("reads the choice back from the class", () => {
    expect(tableRowsOf("a sc-table--striped")).toBe("striped");
    expect(tableRowsOf("sc-table--plain")).toBe("plain");
    expect(tableRowsOf(null)).toBe("look");
  });
});
