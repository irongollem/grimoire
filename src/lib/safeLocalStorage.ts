/**
 * `window.localStorage`, or undefined where reading the property itself throws
 * (a SecurityError when the browser blocks site data). VueUse's
 * `useLocalStorage` reads that property outside its own try/catch, so a
 * module-scope preference built on it would throw while the module evaluates;
 * pass this to `useStorage` instead, which then runs on memory alone.
 */
export function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
