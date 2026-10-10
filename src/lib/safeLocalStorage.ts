/**
 * The browser's storage, or memory where the browser will not hand it over.
 *
 * With site data blocked (Chrome or Safari set to block cookies and site data,
 * some embedded webviews) reading `window.localStorage` throws a SecurityError,
 * and so does `typeof localStorage`, because evaluating the identifier runs the
 * getter. Grimoire reads storage while modules evaluate at boot, so one bare
 * read there stopped the app starting at all (#1043), where the right outcome
 * is an app that works and only forgets its preferences on reload.
 *
 * So nothing outside this module touches `localStorage` or `sessionStorage`
 * directly (`storageAccess.test.ts` fails the suite if anything does). Read
 * and write through these instead; for a reactive preference pass one to
 * VueUse's `useStorage(key, default, safeLocalStorage(), ...)`, never
 * `useLocalStorage`, which reads `window.localStorage` outside its own
 * try/catch.
 *
 * The fallback is one shared in-memory store per area rather than nothing, so
 * a value written in this tab reads back in this tab: an unread marker clears,
 * a remembered campaign survives a mode switch. It is simply gone on reload.
 * The real storage is looked up on every call, not cached, so a test that
 * stubs `localStorage` is seen.
 *
 * Only reading the property is guarded. A `setItem` on real storage can still
 * throw when the quota is full; call sites where that matters keep their own
 * try/catch.
 */

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }
}

const memoryLocal = new MemoryStorage();
const memorySession = new MemoryStorage();

function realStorage(area: "localStorage" | "sessionStorage"): Storage | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    return window[area] ?? undefined;
  } catch {
    return undefined;
  }
}

/** `window.localStorage`, or this tab's memory when the browser blocks it. */
export function safeLocalStorage(): Storage {
  return realStorage("localStorage") ?? memoryLocal;
}

/** `window.sessionStorage`, or this tab's memory when the browser blocks it. */
export function safeSessionStorage(): Storage {
  return realStorage("sessionStorage") ?? memorySession;
}

/**
 * Whether this browser keeps what is written across a reload. False when site
 * data is blocked, so a setting that only makes sense if it persists (a
 * provider key kept on this device) can say so instead of pretending.
 */
export function localStorageAvailable(): boolean {
  return realStorage("localStorage") !== undefined;
}
