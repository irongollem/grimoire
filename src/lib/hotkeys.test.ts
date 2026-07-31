import { describe, expect, it } from "vitest";
import { formatCombo, isMacPlatform, isTextEntryTarget, matchesCombo, parseCombo } from "@/lib/hotkeys";

describe("parseCombo", () => {
  it("parses a bare key with no modifiers", () => {
    expect(parseCombo("k")).toEqual({ key: "k", mod: false, shift: false, alt: false });
  });

  it("parses a digit key", () => {
    expect(parseCombo("1")).toEqual({ key: "1", mod: false, shift: false, alt: false });
  });

  it("parses named keys", () => {
    expect(parseCombo("space")).toEqual({ key: "space", mod: false, shift: false, alt: false });
    expect(parseCombo("arrowup")).toEqual({ key: "arrowup", mod: false, shift: false, alt: false });
  });

  it("parses punctuation keys", () => {
    expect(parseCombo("?")).toEqual({ key: "?", mod: false, shift: false, alt: false });
    expect(parseCombo("/")).toEqual({ key: "/", mod: false, shift: false, alt: false });
  });

  it("parses a single modifier plus key", () => {
    expect(parseCombo("mod+k")).toEqual({ key: "k", mod: true, shift: false, alt: false });
    expect(parseCombo("shift+k")).toEqual({ key: "k", mod: false, shift: true, alt: false });
    expect(parseCombo("alt+k")).toEqual({ key: "k", mod: false, shift: false, alt: true });
  });

  it("parses multiple modifiers plus key", () => {
    expect(parseCombo("mod+shift+k")).toEqual({ key: "k", mod: true, shift: true, alt: false });
    expect(parseCombo("mod+shift+alt+k")).toEqual({ key: "k", mod: true, shift: true, alt: true });
  });

  it("is case-insensitive", () => {
    expect(parseCombo("MOD+SHIFT+K")).toEqual({ key: "k", mod: true, shift: true, alt: false });
  });

  it("is whitespace-tolerant", () => {
    expect(parseCombo(" mod + shift + k ")).toEqual({ key: "k", mod: true, shift: true, alt: false });
  });

  it("throws on an empty combo", () => {
    expect(() => parseCombo("")).toThrow(/empty/i);
    expect(() => parseCombo("   ")).toThrow(/empty/i);
  });

  it("throws on an unknown-only-modifier combo", () => {
    expect(() => parseCombo("shift+")).toThrow();
    expect(() => parseCombo("shift+alt")).toThrow();
    expect(() => parseCombo("mod+")).toThrow();
  });

  it("throws on an unrecognised modifier segment", () => {
    expect(() => parseCombo("ctrl+k")).toThrow(/unknown modifier/i);
  });
});

describe("matchesCombo — punctuation carries its own shift state", () => {
  // "?" is what Shift+"/" produces. Demanding shiftKey === false as well would
  // mean the binding could never match any real keypress.
  it("matches \"?\" on the event the keyboard actually sends", () => {
    const event = new KeyboardEvent("keydown", { key: "?", shiftKey: true });
    expect(matchesCombo(event, parseCombo("?"), false)).toBe(true);
  });

  it("still distinguishes a letter by its shift state", () => {
    const shifted = new KeyboardEvent("keydown", { key: "K", shiftKey: true });
    expect(matchesCombo(shifted, parseCombo("k"), false)).toBe(false);
    expect(matchesCombo(shifted, parseCombo("shift+k"), false)).toBe(true);
  });

  it("still distinguishes a digit by its shift state", () => {
    const plain = new KeyboardEvent("keydown", { key: "1" });
    expect(matchesCombo(plain, parseCombo("1"), false)).toBe(true);
    expect(matchesCombo(plain, parseCombo("shift+1"), false)).toBe(false);
  });
});

describe("matchesCombo", () => {
  function keyEvent(init: KeyboardEventInit): KeyboardEvent {
    return new KeyboardEvent("keydown", init);
  }

  it("matches a bare key with no modifiers held, on both platforms", () => {
    const parsed = parseCombo("k");
    expect(matchesCombo(keyEvent({ key: "k" }), parsed, true)).toBe(true);
    expect(matchesCombo(keyEvent({ key: "k" }), parsed, false)).toBe(true);
  });

  it("does not match a bare '1' binding when Cmd+1 is pressed (macOS tab switching)", () => {
    const parsed = parseCombo("1");
    expect(matchesCombo(keyEvent({ key: "1", metaKey: true }), parsed, true)).toBe(false);
  });

  it("does not match a bare '1' binding when Ctrl+1 is pressed on non-mac", () => {
    const parsed = parseCombo("1");
    expect(matchesCombo(keyEvent({ key: "1", ctrlKey: true }), parsed, false)).toBe(false);
  });

  it("matches mod+k via Cmd on macOS and Ctrl elsewhere", () => {
    const parsed = parseCombo("mod+k");
    expect(matchesCombo(keyEvent({ key: "k", metaKey: true }), parsed, true)).toBe(true);
    expect(matchesCombo(keyEvent({ key: "k", ctrlKey: true }), parsed, false)).toBe(true);
  });

  it("does not match mod+k on macOS if Ctrl (not Cmd) is held instead", () => {
    const parsed = parseCombo("mod+k");
    expect(matchesCombo(keyEvent({ key: "k", ctrlKey: true }), parsed, true)).toBe(false);
  });

  it("does not match mod+k elsewhere if Cmd/Meta (not Ctrl) is held instead", () => {
    const parsed = parseCombo("mod+k");
    expect(matchesCombo(keyEvent({ key: "k", metaKey: true }), parsed, false)).toBe(false);
  });

  it("does not match mod+k when Cmd+Shift+K is pressed — modifier match is exact", () => {
    const parsed = parseCombo("mod+k");
    expect(matchesCombo(keyEvent({ key: "k", metaKey: true, shiftKey: true }), parsed, true)).toBe(false);
  });

  it("does not match mod+k when the other platform's mod key is ALSO held", () => {
    const parsed = parseCombo("mod+k");
    expect(matchesCombo(keyEvent({ key: "k", metaKey: true, ctrlKey: true }), parsed, true)).toBe(false);
  });

  it("does not match when shift is required but absent", () => {
    const parsed = parseCombo("shift+k");
    expect(matchesCombo(keyEvent({ key: "k" }), parsed, true)).toBe(false);
  });

  it("does not match when an extra modifier (alt) is held beyond what's required", () => {
    const parsed = parseCombo("shift+k");
    expect(matchesCombo(keyEvent({ key: "k", shiftKey: true, altKey: true }), parsed, true)).toBe(false);
  });

  it("does not match a different key even with identical modifiers", () => {
    const parsed = parseCombo("mod+k");
    expect(matchesCombo(keyEvent({ key: "j", metaKey: true }), parsed, true)).toBe(false);
  });

  it("normalises ' ' to the 'space' key identity", () => {
    const parsed = parseCombo("space");
    expect(matchesCombo(keyEvent({ key: " " }), parsed, true)).toBe(true);
  });

  it("compares keys case-insensitively", () => {
    const parsed = parseCombo("k");
    expect(matchesCombo(keyEvent({ key: "K" }), parsed, true)).toBe(true);
  });
});

describe("formatCombo", () => {
  it("formats a bare key the same on both platforms", () => {
    expect(formatCombo("k", true)).toBe("K");
    expect(formatCombo("k", false)).toBe("K");
  });

  it("formats mod+shift+k with symbols on macOS", () => {
    expect(formatCombo("mod+shift+k", true)).toBe("⌘⇧K");
  });

  it("formats mod+shift+k with names elsewhere", () => {
    expect(formatCombo("mod+shift+k", false)).toBe("Ctrl+Shift+K");
  });

  it("formats a lone alt as its symbol on macOS", () => {
    expect(formatCombo("alt+k", true)).toBe("⌥K");
  });

  it("formats a lone alt with a name elsewhere", () => {
    expect(formatCombo("alt+k", false)).toBe("Alt+K");
  });

  it("formats named keys", () => {
    expect(formatCombo("space", false)).toBe("Space");
    expect(formatCombo("escape", false)).toBe("Esc");
  });

  it("formats arrow keys as glyphs on both platforms", () => {
    expect(formatCombo("arrowup", true)).toBe("↑");
    expect(formatCombo("arrowdown", false)).toBe("↓");
    expect(formatCombo("arrowleft", false)).toBe("←");
    expect(formatCombo("arrowright", true)).toBe("→");
  });

  it("uppercases single-letter keys", () => {
    expect(formatCombo("mod+j", false)).toBe("Ctrl+J");
  });
});

describe("isTextEntryTarget", () => {
  it("is false for null", () => {
    expect(isTextEntryTarget(null)).toBe(false);
  });

  it("is true for a text input", () => {
    const input = document.createElement("input");
    expect(isTextEntryTarget(input)).toBe(true);
  });

  it("is true for input types without an explicit type (defaults to text)", () => {
    const input = document.createElement("input");
    input.removeAttribute("type");
    expect(isTextEntryTarget(input)).toBe(true);
  });

  it("is false for checkbox/radio/button/submit inputs", () => {
    for (const type of ["checkbox", "radio", "button", "submit"]) {
      const input = document.createElement("input");
      input.type = type;
      expect(isTextEntryTarget(input)).toBe(false);
    }
  });

  it("is true for a textarea", () => {
    expect(isTextEntryTarget(document.createElement("textarea"))).toBe(true);
  });

  it("is true for a select", () => {
    expect(isTextEntryTarget(document.createElement("select"))).toBe(true);
  });

  it("is false for a plain div", () => {
    expect(isTextEntryTarget(document.createElement("div"))).toBe(false);
  });

  it("is true for a contenteditable div (tiptap's ProseMirror root)", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isTextEntryTarget(div)).toBe(true);
  });

  it("is true for a span nested inside a contenteditable div", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    const span = document.createElement("span");
    div.appendChild(span);
    document.body.appendChild(div);
    expect(isTextEntryTarget(span)).toBe(true);
    document.body.removeChild(div);
  });
});

describe("isMacPlatform", () => {
  it("returns a boolean without throwing", () => {
    expect(typeof isMacPlatform()).toBe("boolean");
  });
});
