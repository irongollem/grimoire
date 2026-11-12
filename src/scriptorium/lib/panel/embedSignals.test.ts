// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { EMBED_DETACH_EVENT, EMBED_OPEN_EVENT, signalEmbed } from "./embedSignals";

function fakeEditor(dom: unknown, destroyed = false): Editor {
  return { isDestroyed: destroyed, view: { nodeDOM: () => dom } } as unknown as Editor;
}

describe("signalEmbed", () => {
  // Fails on: the panel's Detach reaching nothing because the event went to the wrong element.
  it("says it on the entry's own element and reports it was heard for", () => {
    const el = document.createElement("div");
    const heard = vi.fn();
    el.addEventListener(EMBED_DETACH_EVENT, heard);
    expect(signalEmbed(fakeEditor(el), 4, EMBED_DETACH_EVENT)).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    const other = vi.fn();
    el.addEventListener(EMBED_OPEN_EVENT, other);
    signalEmbed(fakeEditor(el), 4, EMBED_DETACH_EVENT);
    expect(other).not.toHaveBeenCalled();
  });

  it("does nothing for an entry that is not drawn or an editor that is gone", () => {
    expect(signalEmbed(fakeEditor(null), 4, EMBED_OPEN_EVENT)).toBe(false);
    expect(signalEmbed(fakeEditor(document.createElement("div"), true), 4, EMBED_OPEN_EVENT)).toBe(false);
  });
});
