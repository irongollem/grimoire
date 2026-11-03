import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { effectScope, ref, type MaybeRefOrGetter } from "vue";
import { isMacPlatform } from "@/lib/hotkeys";
import { useHotkeys, useActiveHotkeys, type HotkeyBinding } from "./useHotkeys";

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

// The module under test resolves "mod" against the REAL platform once at
// load time, and happy-dom's reported platform/userAgent don't contain "mac"
// even when the test host is a Mac — so tests must hold whichever key
// isMacPlatform() actually decided on, not assume Cmd.
function modInit(): KeyboardEventInit {
  return isMacPlatform() ? { metaKey: true } : { ctrlKey: true };
}

function dispatch(event: KeyboardEvent): void {
  document.dispatchEvent(event);
}

// Every test registers through a fresh effectScope so disposal (the thing
// several tests are specifically checking) is explicit and doesn't leak
// listeners into the next test.
let scopes: ReturnType<typeof effectScope>[] = [];

function register(
  bindings: MaybeRefOrGetter<HotkeyBinding[]>,
  options?: Parameters<typeof useHotkeys>[1],
): ReturnType<typeof effectScope> {
  const scope = effectScope();
  // Track the scope BEFORE running — a malformed combo makes useHotkeys throw
  // synchronously, and the scope must still be disposed in afterEach so the
  // (partially registered) binding doesn't leak into the next test.
  scopes.push(scope);
  scope.run(() => useHotkeys(bindings, options));
  return scope;
}

beforeEach(() => {
  scopes = [];
});

afterEach(() => {
  for (const scope of scopes) scope.stop();
});

describe("useHotkeys", () => {
  it("fires the handler when its combo is pressed", () => {
    const handler = vi.fn();
    register([{ combo: "mod+k", description: "Open search", handler }]);

    dispatch(keyEvent({ key: "k", ...modInit() }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire the handler after its scope is disposed", () => {
    const handler = vi.fn();
    const scope = register([{ combo: "mod+k", description: "Open search", handler }]);

    scope.stop();
    dispatch(keyEvent({ key: "k", ...modInit() }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("removes the document listener once the last scope disposes", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const scopeA = register([{ combo: "mod+k", description: "A", handler: vi.fn() }]);
    const scopeB = register([{ combo: "mod+j", description: "B", handler: vi.fn() }]);

    const keydownAdds = addSpy.mock.calls.filter((call) => call[0] === "keydown");
    // One shared listener regardless of how many registrations exist.
    expect(keydownAdds).toHaveLength(1);

    scopeA.stop();
    expect(removeSpy.mock.calls.filter((call) => call[0] === "keydown")).toHaveLength(0);

    scopeB.stop();
    expect(removeSpy.mock.calls.filter((call) => call[0] === "keydown")).toHaveLength(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("suppresses a page binding while an overlay binding is registered, even for keys the overlay doesn't bind", () => {
    const pageHandler = vi.fn();
    const overlayHandler = vi.fn();

    register([{ combo: "1", description: "Play sound 1", handler: pageHandler }], { layer: "page" });
    register([{ combo: "escape", description: "Close palette", handler: overlayHandler }], { layer: "overlay" });

    // "1" isn't bound by the overlay at all — it must still be suppressed,
    // not merely lose a precedence tie-break.
    dispatch(keyEvent({ key: "1" }));
    expect(pageHandler).not.toHaveBeenCalled();

    dispatch(keyEvent({ key: "Escape" }));
    expect(overlayHandler).toHaveBeenCalledTimes(1);
  });

  it("does not warn when overlays stack their Escape bindings", () => {
    // Every dismissable overlay binds Escape to close itself; a dialog opened
    // from a palette *should* shadow it and hand it back on unmount. Warning
    // here fired during ordinary use, and a warning that cries wolf is how a
    // real collision gets scrolled past.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    register([{ combo: "escape", description: "Close the palette", handler: vi.fn() }], { layer: "overlay" });
    register([{ combo: "escape", description: "Close", handler: vi.fn() }], { layer: "overlay" });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still warns when two overlays claim the same non-dismiss combo", () => {
    // The suppression above is narrow on purpose: it must not blind the
    // registry to two different actions fighting over one key.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    register([{ combo: "mod+k", description: "Search", handler: vi.fn() }], { layer: "overlay" });
    register([{ combo: "mod+k", description: "Kill audio", handler: vi.fn() }], { layer: "overlay" });

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("prefers a page binding over a global binding for the same combo", () => {
    const globalHandler = vi.fn();
    const pageHandler = vi.fn();

    register([{ combo: "mod+k", description: "Global search", handler: globalHandler }], { layer: "global" });
    register([{ combo: "mod+k", description: "Page-specific search", handler: pageHandler }], { layer: "page" });

    dispatch(keyEvent({ key: "k", ...modInit() }));

    expect(pageHandler).toHaveBeenCalledTimes(1);
    expect(globalHandler).not.toHaveBeenCalled();
  });

  it("falls back to a global binding when no page binding matches the pressed combo", () => {
    const globalHandler = vi.fn();
    register([{ combo: "mod+k", description: "Global search", handler: globalHandler }], { layer: "global" });
    register([{ combo: "mod+j", description: "Unrelated page shortcut", handler: vi.fn() }], { layer: "page" });

    dispatch(keyEvent({ key: "k", ...modInit() }));

    expect(globalHandler).toHaveBeenCalledTimes(1);
  });

  it("skips a text-entry target unless allowInTextEntry is set", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const normalHandler = vi.fn();
    const allowedHandler = vi.fn();
    register([
      { combo: "1", description: "Suppressed while typing", handler: normalHandler },
      { combo: "2", description: "Fires while typing", handler: allowedHandler, allowInTextEntry: true },
    ]);

    // Dispatch directly on the input (it bubbles to the document listener)
    // so event.target is actually the input element.
    input.dispatchEvent(keyEvent({ key: "1" }));
    expect(normalHandler).not.toHaveBeenCalled();

    input.dispatchEvent(keyEvent({ key: "2" }));
    expect(allowedHandler).toHaveBeenCalledTimes(1);

    document.body.removeChild(input);
  });

  it("suppresses matching when enabled is false, and resumes when it becomes true", () => {
    const handler = vi.fn();
    const enabled = ref(false);
    register([{ combo: "mod+k", description: "Toggleable", handler }], { enabled });

    dispatch(keyEvent({ key: "k", ...modInit() }));
    expect(handler).not.toHaveBeenCalled();

    enabled.value = true;
    dispatch(keyEvent({ key: "k", ...modInit() }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores events during IME composition", () => {
    const handler = vi.fn();
    register([{ combo: "k", description: "Plain k", handler }]);

    dispatch(keyEvent({ key: "k", isComposing: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  // Production, 18 Sep 2026, on /dashboard: `Cannot read properties of
  // undefined (reading 'toLowerCase')` at hotkeys.ts:58. `KeyboardEvent.key` is
  // typed `string` and the DOM's typing is lying — this is a document-level
  // listener, so a password manager, accessibility tool or extension can
  // dispatch a plain Event at it, which carries no `key` at all.
  it("ignores a synthetic keydown that carries no key at all", () => {
    const handler = vi.fn();
    register([{ combo: "k", description: "Plain k", handler }]);

    // Deliberately not `keyEvent()`: a real KeyboardEvent always has a string
    // `key` (defaulting to ""), so only a bare Event reproduces what shipped.
    expect(() => document.dispatchEvent(new Event("keydown", { bubbles: true, cancelable: true })))
      .not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("still ignores, rather than matches, a KeyboardEvent whose key is empty", () => {
    const handler = vi.fn();
    register([{ combo: "k", description: "Plain k", handler }]);

    dispatch(keyEvent({}));

    expect(handler).not.toHaveBeenCalled();
  });

  it("throws synchronously when a registered combo is malformed", () => {
    expect(() => register([{ combo: "shift+", description: "Broken", handler: vi.fn() }])).toThrow();
  });

  it("warns in dev when a registration collides with an existing binding in the same layer", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    register([{ combo: "mod+k", description: "First binding", handler: vi.fn() }]);
    register([{ combo: "mod+k", description: "Second binding", handler: vi.fn() }]);

    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(message).toContain("First binding");
    expect(message).toContain("Second binding");

    warnSpy.mockRestore();
  });
});

describe("useHotkeys: which binding fires", () => {
  it("lets a later registration on the same combo shadow the earlier one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = vi.fn();
    const second = vi.fn();
    register([{ combo: "mod+k", description: "First", handler: first }]);
    register([{ combo: "mod+k", description: "Second", handler: second }]);

    dispatch(keyEvent({ key: "k", ...modInit() }));

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("claims the key (preventDefault) only when a binding handled it", () => {
    register([{ combo: "mod+k", description: "Search", handler: vi.fn() }]);

    const handled = keyEvent({ key: "k", ...modInit() });
    dispatch(handled);
    const unbound = keyEvent({ key: "j", ...modInit() });
    dispatch(unbound);

    expect(handled.defaultPrevented).toBe(true);
    expect(unbound.defaultPrevented).toBe(false);
  });

  it("is not silenced by an overlay that is switched off or binds nothing", () => {
    const pageHandler = vi.fn();
    register([{ combo: "1", description: "Play sound 1", handler: pageHandler }]);
    register([{ combo: "escape", description: "Close", handler: vi.fn() }], { layer: "overlay", enabled: false });
    register([], { layer: "overlay" });

    dispatch(keyEvent({ key: "1" }));

    expect(pageHandler).toHaveBeenCalledTimes(1);
  });
});

describe("useHotkeys: collision warnings", () => {
  it("does not warn for the same key in different layers, or when only Shift differs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    register([{ combo: "mod+k", description: "Page search", handler: vi.fn() }], { layer: "page" });
    register([{ combo: "mod+k", description: "Global search", handler: vi.fn() }], { layer: "global" });
    register([{ combo: "mod+shift+k", description: "Shifted", handler: vi.fn() }], { layer: "page" });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("useActiveHotkeys", () => {
  it("lists visible bindings, omits hidden ones, and reacts to new registrations", () => {
    let active: ReturnType<typeof useActiveHotkeys> | undefined;
    const scope = effectScope();
    scope.run(() => {
      active = useActiveHotkeys();
    });
    scopes.push(scope);

    expect(active?.value).toEqual([]);

    register([
      { combo: "mod+k", description: "Open search", handler: vi.fn() },
      { combo: "escape", description: "Hidden close", handler: vi.fn(), hidden: true },
    ]);

    const descriptions = active?.value.map((entry) => entry.description);
    expect(descriptions).toContain("Open search");
    expect(descriptions).not.toContain("Hidden close");
  });

  it("dedupes a same-layer collision down to the binding that would actually fire", () => {
    // This intentionally creates the dev collision warning tested above —
    // silence it here so the test's own output stays clean.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let active: ReturnType<typeof useActiveHotkeys> | undefined;
    const scope = effectScope();
    scope.run(() => {
      active = useActiveHotkeys();
    });
    scopes.push(scope);

    register([{ combo: "mod+k", description: "First binding", handler: vi.fn() }]);
    register([{ combo: "mod+k", description: "Second binding", handler: vi.fn() }]);

    const pageEntries = active?.value.filter((entry) => entry.combo === "mod+k");
    expect(pageEntries).toHaveLength(1);
    expect(pageEntries?.[0].description).toBe("Second binding");

    warnSpy.mockRestore();
  });

  it("leaves out a registration that is switched off, and lists overlay, then page, then global", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let active: ReturnType<typeof useActiveHotkeys> | undefined;
    const scope = effectScope();
    scope.run(() => {
      active = useActiveHotkeys();
    });
    scopes.push(scope);

    register([{ combo: "mod+g", description: "Global thing", handler: vi.fn() }], { layer: "global" });
    register([{ combo: "mod+p", description: "Page thing", handler: vi.fn() }], { layer: "page" });
    register([{ combo: "mod+o", description: "Overlay thing", handler: vi.fn() }], { layer: "overlay" });
    register([{ combo: "mod+x", description: "Off thing", handler: vi.fn() }], { enabled: false });

    expect(active?.value.map((entry) => entry.description)).toEqual(["Overlay thing", "Page thing", "Global thing"]);
    warn.mockRestore();
  });

  it("lists the same key bound in two layers twice, once per layer", () => {
    let active: ReturnType<typeof useActiveHotkeys> | undefined;
    const scope = effectScope();
    scope.run(() => {
      active = useActiveHotkeys();
    });
    scopes.push(scope);

    register([{ combo: "mod+k", description: "Page search", handler: vi.fn() }], { layer: "page" });
    register([{ combo: "mod+k", description: "Global search", handler: vi.fn() }], { layer: "global" });

    expect(active?.value.filter((entry) => entry.combo === "mod+k").map((entry) => entry.layer)).toEqual(["page", "global"]);
  });
});

function keyUp(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keyup", { bubbles: true, cancelable: true, ...init });
}

describe("useHotkeys release", () => {
  it("calls onRelease on keyup of the key that fired the binding", () => {
    const onRelease = vi.fn();
    register([{ combo: "g", description: "Gate", handler: vi.fn(), onRelease }]);

    dispatch(keyEvent({ key: "g", code: "KeyG" }));
    expect(onRelease).not.toHaveBeenCalled();
    dispatch(keyUp({ key: "g", code: "KeyG" }));

    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("releases even when the keyup carries different modifiers (shift pressed mid-hold)", () => {
    const onRelease = vi.fn();
    register([{ combo: "1", description: "Pad", handler: vi.fn(), onRelease }]);

    dispatch(keyEvent({ key: "1", code: "Digit1" }));
    dispatch(keyUp({ key: "!", code: "Digit1", shiftKey: true }));

    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("releases the same binding after an overlay opened mid-hold, not the overlay's", () => {
    const pageRelease = vi.fn();
    const overlayRelease = vi.fn();
    register([{ combo: "1", description: "Pad", handler: vi.fn(), onRelease: pageRelease }]);
    dispatch(keyEvent({ key: "1", code: "Digit1" }));

    register([{ combo: "1", description: "Overlay", handler: vi.fn(), onRelease: overlayRelease }], {
      layer: "overlay",
    });
    dispatch(keyUp({ key: "1", code: "Digit1" }));

    expect(pageRelease).toHaveBeenCalledTimes(1);
    expect(overlayRelease).not.toHaveBeenCalled();
  });

  it("does not release on a keyup for a key that was never held", () => {
    const onRelease = vi.fn();
    register([{ combo: "g", description: "Gate", handler: vi.fn(), onRelease }]);

    dispatch(keyUp({ key: "g", code: "KeyG" }));

    expect(onRelease).not.toHaveBeenCalled();
  });

  it("releases only once per press", () => {
    const onRelease = vi.fn();
    register([{ combo: "g", description: "Gate", handler: vi.fn(), onRelease }]);

    dispatch(keyEvent({ key: "g", code: "KeyG" }));
    dispatch(keyUp({ key: "g", code: "KeyG" }));
    dispatch(keyUp({ key: "g", code: "KeyG" }));

    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("releases every held binding when the window loses focus", () => {
    const a = vi.fn();
    const b = vi.fn();
    register([
      { combo: "g", description: "A", handler: vi.fn(), onRelease: a },
      { combo: "h", description: "B", handler: vi.fn(), onRelease: b },
    ]);

    dispatch(keyEvent({ key: "g", code: "KeyG" }));
    dispatch(keyEvent({ key: "h", code: "KeyH" }));
    window.dispatchEvent(new Event("blur"));

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    // A later keyup must not release a second time.
    dispatch(keyUp({ key: "g", code: "KeyG" }));
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("releases held bindings when the document becomes hidden", () => {
    const onRelease = vi.fn();
    register([{ combo: "g", description: "Gate", handler: vi.fn(), onRelease }]);
    dispatch(keyEvent({ key: "g", code: "KeyG" }));

    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    spy.mockRestore();

    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("keeps holding when the document becomes visible again", () => {
    const onRelease = vi.fn();
    register([{ combo: "g", description: "Gate", handler: vi.fn(), onRelease }]);
    dispatch(keyEvent({ key: "g", code: "KeyG" }));

    document.dispatchEvent(new Event("visibilitychange"));

    expect(onRelease).not.toHaveBeenCalled();
  });

  it("releases a held binding when its registration is disposed", () => {
    const onRelease = vi.fn();
    const scope = register([{ combo: "g", description: "Gate", handler: vi.fn(), onRelease }]);
    dispatch(keyEvent({ key: "g", code: "KeyG" }));

    scope.stop();

    expect(onRelease).toHaveBeenCalledTimes(1);
    dispatch(keyUp({ key: "g", code: "KeyG" }));
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("does not release for a keydown that did not fire in text entry", () => {
    const onRelease = vi.fn();
    register([{ combo: "g", description: "Gate", handler: vi.fn(), onRelease }]);
    const input = document.createElement("input");
    document.body.appendChild(input);

    input.dispatchEvent(keyEvent({ key: "g", code: "KeyG" }));
    input.dispatchEvent(keyUp({ key: "g", code: "KeyG" }));
    input.remove();

    expect(onRelease).not.toHaveBeenCalled();
  });

  it("releases an allowInTextEntry binding that fired in text entry", () => {
    const onRelease = vi.fn();
    register([{ combo: "g", description: "Gate", handler: vi.fn(), onRelease, allowInTextEntry: true }]);
    const input = document.createElement("input");
    document.body.appendChild(input);

    input.dispatchEvent(keyEvent({ key: "g", code: "KeyG" }));
    input.dispatchEvent(keyUp({ key: "g", code: "KeyG" }));
    input.remove();

    expect(onRelease).toHaveBeenCalledTimes(1);
  });
});

describe("useHotkeys ignoreRepeat", () => {
  it("calls the handler once for a held key, not for each auto-repeat", () => {
    const handler = vi.fn();
    register([{ combo: "g", description: "Gate", handler, ignoreRepeat: true }]);

    dispatch(keyEvent({ key: "g" }));
    dispatch(keyEvent({ key: "g", repeat: true }));
    dispatch(keyEvent({ key: "g", repeat: true }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("still calls the handler for repeats when ignoreRepeat is off", () => {
    const handler = vi.fn();
    register([{ combo: "g", description: "Repeat pad", handler }]);

    dispatch(keyEvent({ key: "g" }));
    dispatch(keyEvent({ key: "g", repeat: true }));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("swallows a repeat without letting a lower layer take it, and still prevents default", () => {
    const pageHandler = vi.fn();
    const globalHandler = vi.fn();
    register([{ combo: "g", description: "Page", handler: pageHandler, ignoreRepeat: true }], { layer: "page" });
    register([{ combo: "g", description: "Global", handler: globalHandler }], { layer: "global" });

    const repeat = keyEvent({ key: "g", repeat: true });
    dispatch(repeat);

    expect(pageHandler).not.toHaveBeenCalled();
    expect(globalHandler).not.toHaveBeenCalled();
    expect(repeat.defaultPrevented).toBe(true);
  });
});
