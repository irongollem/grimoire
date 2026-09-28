import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// Loading the Cast SDK sends the visitor's IP to Google, so it must wait for
// someone to ask to cast. These pin that, and the preload for a browser that
// already has.
const injected: string[] = [];

async function freshUseCast() {
  vi.resetModules();
  setActivePinia(createPinia());
  return (await import("./useCast")).useCast();
}

describe("useCast", () => {
  beforeEach(() => {
    // Record rather than query: the test DOM fails the load at once, and the
    // onerror handler removes the tag again.
    injected.length = 0;
    const append = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementation(<T extends Node>(node: T): T => {
      if (node instanceof HTMLScriptElement) {
        injected.push(node.src);
        return node;
      }
      return append(node);
    });
    localStorage.clear();
    (window as unknown as { chrome?: object }).chrome = {};
  });

  afterEach(() => vi.restoreAllMocks());

  it("does not contact Google when the soundboard opens", async () => {
    const cast = await freshUseCast();
    expect(injected).toEqual([]);
    expect(cast.isCastAvailable.value).toBe(true);
  });

  it("loads the SDK on the first click, without remembering an unfinished attempt", async () => {
    const cast = await freshUseCast();
    void cast.openDevicePicker();
    expect(injected).toEqual([expect.stringContaining("gstatic.com/cv/js/sender")]);
    expect(cast.isCastLoading.value).toBe(true);
    // Only a started session is remembered; a click alone must not make later
    // visits contact Google automatically.
    expect(localStorage.getItem("grimoire:cast-used")).toBeNull();
  });

  it("preloads for a browser that has cast before", async () => {
    localStorage.setItem("grimoire:cast-used", "1");
    await freshUseCast();
    expect(injected).toEqual([expect.stringContaining("gstatic.com/cv/js/sender")]);
  });

  it("hides the button, and loads nothing, where Cast cannot work", async () => {
    delete (window as unknown as { chrome?: object }).chrome;
    localStorage.setItem("grimoire:cast-used", "1");
    const cast = await freshUseCast();
    expect(cast.isCastAvailable.value).toBe(false);
    expect(injected).toEqual([]);
  });

  it("offers a retry when the picker fails right after a first-time load", async () => {
    const requestSession = vi.fn().mockRejectedValue("session_error");
    const listener = { addEventListener: vi.fn() };
    const w = window as unknown as Record<string, unknown>;
    w.cast = {
      framework: {
        CastContext: {
          getInstance: () => ({ setOptions: vi.fn(), requestSession, ...listener }),
        },
        RemotePlayer: class {},
        RemotePlayerController: class { addEventListener = vi.fn(); },
        CastContextEventType: { SESSION_STATE_CHANGED: "s" },
        RemotePlayerEventType: { PLAYER_STATE_CHANGED: "p" },
      },
    };
    const cast = await freshUseCast();
    const opened = cast.openDevicePicker();
    (w.__onGCastApiAvailable as (ok: boolean) => void)(true);
    await opened;
    await vi.waitFor(() => expect(cast.needsSecondClick.value).toBe(true));
    expect(requestSession).toHaveBeenCalledOnce();
    expect(localStorage.getItem("grimoire:cast-used")).toBeNull();
    delete w.cast;
  });

  it("remembers the choice once a session has actually started", async () => {
    let onSession: ((e: { sessionState: string }) => void) | undefined;
    const w = window as unknown as Record<string, unknown>;
    w.cast = {
      framework: {
        CastContext: {
          getInstance: () => ({
            setOptions: vi.fn(),
            requestSession: vi.fn().mockResolvedValue(null),
            addEventListener: (_: string, h: typeof onSession) => { onSession = h; },
          }),
        },
        RemotePlayer: class {},
        RemotePlayerController: class { addEventListener = vi.fn(); },
        CastContextEventType: { SESSION_STATE_CHANGED: "s" },
        RemotePlayerEventType: { PLAYER_STATE_CHANGED: "p" },
        SessionState: {
          SESSION_STARTED: "started",
          SESSION_RESUMED: "resumed",
          SESSION_ENDED: "ended",
          SESSION_START_FAILED: "failed",
        },
      },
    };
    const cast = await freshUseCast();
    const opened = cast.openDevicePicker();
    (w.__onGCastApiAvailable as (ok: boolean) => void)(true);
    await opened;
    expect(localStorage.getItem("grimoire:cast-used")).toBeNull();
    onSession?.({ sessionState: "started" });
    expect(localStorage.getItem("grimoire:cast-used")).toBe("1");
    delete w.cast;
  });
});
