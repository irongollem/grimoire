import { describe, expect, it } from "vitest";
import { composerKeyAction, type ComposerKey } from "./composerKeys";

const key = (over: Partial<ComposerKey> = {}): ComposerKey => ({ key: "Enter", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, ...over });

describe("composerKeyAction", () => {
  it("says on Enter", () => expect(composerKeyAction(key())).toBe("say"));

  // Bug caught: Alt+Enter treated as a plain Enter, so Do never does and every line is said aloud.
  it("does on Alt+Enter", () => expect(composerKeyAction(key({ altKey: true }))).toBe("do"));

  // Bug caught: Shift+Enter sending, so a line can never be broken in two.
  it("leaves Shift+Enter to the textarea", () => {
    expect(composerKeyAction(key({ shiftKey: true }))).toBeNull();
    expect(composerKeyAction(key({ shiftKey: true, altKey: true }))).toBeNull();
  });

  // Bug caught: Enter that commits an IME's composition (Japanese, Chinese) sending half a word.
  it("ignores Enter while an input method is composing", () => expect(composerKeyAction(key({ isComposing: true }))).toBeNull());

  it("ignores other keys and the chords of other shortcuts", () => {
    expect(composerKeyAction(key({ key: "a" }))).toBeNull();
    expect(composerKeyAction(key({ ctrlKey: true }))).toBeNull();
    expect(composerKeyAction(key({ metaKey: true }))).toBeNull();
  });
});
