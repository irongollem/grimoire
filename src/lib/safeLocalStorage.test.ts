// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { localStorageAvailable, safeLocalStorage, safeSessionStorage } from "./safeLocalStorage";

function blockStorage(area: "localStorage" | "sessionStorage") {
  const original = Object.getOwnPropertyDescriptor(window, area);
  Object.defineProperty(window, area, {
    configurable: true,
    get() {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
  return () => {
    if (original) Object.defineProperty(window, area, original);
  };
}

describe("safeLocalStorage", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("hands back the browser's storage when it is readable", () => {
    window.localStorage.setItem("k", "v");
    expect(safeLocalStorage().getItem("k")).toBe("v");
    expect(localStorageAvailable()).toBe(true);
  });

  it("runs on memory when reading the property throws", () => {
    restore = blockStorage("localStorage");
    const storage = safeLocalStorage();
    expect(storage.getItem("k")).toBeNull();
    storage.setItem("k", "v");
    expect(safeLocalStorage().getItem("k")).toBe("v");
    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe("k");
    storage.removeItem("k");
    expect(storage.getItem("k")).toBeNull();
    expect(localStorageAvailable()).toBe(false);
  });

  it("guards sessionStorage the same way", () => {
    restore = blockStorage("sessionStorage");
    safeSessionStorage().setItem("s", "1");
    expect(safeSessionStorage().getItem("s")).toBe("1");
  });

  it("looks the storage up on every call, so a stub is seen", () => {
    const stub = { getItem: vi.fn(() => "stubbed") } as unknown as Storage;
    vi.stubGlobal("localStorage", stub);
    expect(safeLocalStorage().getItem("anything")).toBe("stubbed");
  });
});
