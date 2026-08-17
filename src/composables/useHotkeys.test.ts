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
});
