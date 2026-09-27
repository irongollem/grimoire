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

  it("loads the SDK on the first click and remembers the choice", async () => {
    const cast = await freshUseCast();
    void cast.openDevicePicker();
    expect(injected).toEqual([expect.stringContaining("gstatic.com/cv/js/sender")]);
    expect(cast.isCastLoading.value).toBe(true);
    expect(localStorage.getItem("grimoire:cast-used")).toBe("1");
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
});
