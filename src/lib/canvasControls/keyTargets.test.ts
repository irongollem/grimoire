// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { isTextEntry, targetKeepsSpace } from "./keyTargets";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount<T extends HTMLElement>(html: string): T {
  document.body.innerHTML = html;
  return document.body.firstElementChild as T;
}

describe("isTextEntry", () => {
  it("is true for inputs and textareas and false for other elements and null", () => {
    expect(isTextEntry(mount("<input>"))).toBe(true);
    expect(isTextEntry(mount("<textarea></textarea>"))).toBe(true);
    expect(isTextEntry(mount("<div></div>"))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe("targetKeepsSpace", () => {
  it("keeps Space for text entry", () => {
    expect(targetKeepsSpace(mount("<input>"))).toBe(true);
  });

  it("does not keep Space for the page, a missing target, or a plain element", () => {
    expect(targetKeepsSpace(null)).toBe(false);
    expect(targetKeepsSpace(mount("<div></div>"))).toBe(false);
  });

  it("does not keep Space for a control that is not keyboard-focused", () => {
    // jsdom never reports :focus-visible, which is the mouse-clicked case.
    expect(targetKeepsSpace(mount("<button>Tool</button>"))).toBe(false);
  });

  it("keeps Space for a control a keyboard user tabbed to", () => {
    const button = mount<HTMLButtonElement>("<button>Tool</button>");
    const original = button.matches.bind(button);
    Object.defineProperty(button, "matches", { value: (sel: string) => (sel === ":focus-visible" ? true : original(sel)) });
    expect(targetKeepsSpace(button)).toBe(true);
  });

  it("does not throw where :focus-visible is unknown", () => {
    const button = mount<HTMLButtonElement>("<button>Tool</button>");
    Object.defineProperty(button, "matches", {
      value: () => {
        throw new SyntaxError("unknown pseudo-class");
      },
    });
    expect(targetKeepsSpace(button)).toBe(false);
  });
});
