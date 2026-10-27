// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { focusTab, nextTabIndex } from "@/lib/tabKeys";

describe("nextTabIndex", () => {
  it("moves right and wraps", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
  });
  it("moves left and wraps", () => {
    expect(nextTabIndex("ArrowLeft", 1, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
  });
  it("jumps to the ends", () => {
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
  });
  it("ignores other keys and empty lists", () => {
    expect(nextTabIndex("Enter", 0, 3)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("focusTab", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function tablists() {
    document.body.innerHTML = `
      <div role="tablist" id="first"><button role="tab" id="a1"></button><button role="tab" id="a2"></button><button role="tab" id="a3"></button></div>
      <div role="tablist" id="second"><button role="tab" id="b1"></button><button role="tab" id="b2"></button></div>`;
    return (id: string) => document.getElementById(id) as HTMLElement;
  }

  it("moves focus to the tab at that index in the tablist the key was pressed in", () => {
    const el = tablists();
    focusTab(el("b1"), 1);
    expect(document.activeElement).toBe(el("b2"));
  });

  it("does nothing when the key came from outside a tablist or the index is past the end", () => {
    const el = tablists();
    el("a1").focus();
    focusTab(document.body, 0);
    focusTab(el("a1"), 7);
    focusTab(null, 0);
    expect(document.activeElement).toBe(el("a1"));
  });
});
