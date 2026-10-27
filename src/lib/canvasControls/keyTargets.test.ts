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

/** Make an element answer `:focus-visible`, as a control a keyboard user tabbed to does. */
function keyboardFocused<T extends HTMLElement>(el: T): T {
  const original = el.matches.bind(el);
  Object.defineProperty(el, "matches", { value: (sel: string) => (sel === ":focus-visible" ? true : original(sel)) });
  return el;
}

describe("isTextEntry", () => {
  it("is true for inputs, textareas and contenteditable, false for other elements and null", () => {
    expect(isTextEntry(mount("<input>"))).toBe(true);
    expect(isTextEntry(mount("<textarea></textarea>"))).toBe(true);
    const editable = mount<HTMLElement>("<div></div>");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTextEntry(editable)).toBe(true);
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

  it.each([
    ["a button", "<button>Tool</button>"],
    ["a link", '<a href="/x">Go</a>'],
    ["a select", "<select><option>a</option></select>"],
    ["a switch", '<div role="switch"></div>'],
    ["a checkbox", '<div role="checkbox"></div>'],
    ["a tab", '<div role="tab"></div>'],
  ])("keeps Space for %s a keyboard user tabbed to", (_name, html) => {
    expect(targetKeepsSpace(keyboardFocused(mount(html)))).toBe(true);
  });

  it("still pans on a keyboard-focused element that is not a control, such as the canvas itself", () => {
    expect(targetKeepsSpace(keyboardFocused(mount('<div tabindex="0"></div>')))).toBe(false);
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
