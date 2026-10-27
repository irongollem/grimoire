// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCombo, isMacPlatform, isTextEntryTarget, matchesCombo, parseCombo } from "@/lib/hotkeys";

describe("parseCombo", () => {
  it("parses a bare key with no modifiers", () => {
    expect(parseCombo("k")).toEqual({ key: "k", mod: false, shift: false, alt: false });
  });

  it.each(["1", "space", "arrowup", "?", "/"])("takes %s as a key, not a modifier", (key) => {
    expect(parseCombo(key)).toEqual({ key, mod: false, shift: false, alt: false });
  });

  it("parses a single modifier plus key", () => {
    expect(parseCombo("mod+k")).toEqual({ key: "k", mod: true, shift: false, alt: false });
    expect(parseCombo("shift+k")).toEqual({ key: "k", mod: false, shift: true, alt: false });
    expect(parseCombo("alt+k")).toEqual({ key: "k", mod: false, shift: false, alt: true });
  });

  it("parses all three modifiers together", () => {
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

  it("formats alt as its symbol on macOS and by name elsewhere", () => {
    expect(formatCombo("alt+k", true)).toBe("⌥K");
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
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["the platform string", { platform: "MacIntel", userAgent: "Mozilla/5.0" }],
    ["the user agent when the platform string is blank (iPadOS)", { platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" }],
  ])("is true from %s", (_title, nav) => {
    vi.stubGlobal("navigator", nav);
    expect(isMacPlatform()).toBe(true);
  });

  it("is false on Windows and Linux", () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0)" });
    expect(isMacPlatform()).toBe(false);
  });
});
