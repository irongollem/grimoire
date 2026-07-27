// Pure keyboard-combo matching/formatting core for the app-wide hotkey registry.
//
// Deliberately Vue-free: every shortcut in the app currently rolls its own
// `document.addEventListener("keydown", ...)` (GlobalSearch, ImageLightbox,
// the cartographer editor, ...), so nothing knows what anything else has
// bound and a new shortcut can silently shadow an existing one. This module
// is the data-in/data-out layer that `composables/useHotkeys.ts` builds the
// actual registry on top of — keeping it pure means it can be unit-tested as
// plain functions and reused anywhere a combo string needs interpreting
// (a future cheat-sheet renderer, for instance) without dragging Vue along.

export interface ParsedCombo {
  /** Lowercase key identity: "k", "1", "space", "arrowup", "escape", "/", "?" */
  key: string;
  /** Cmd on macOS, Ctrl everywhere else. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

const MODIFIER_SEGMENTS = new Set(["mod", "shift", "alt"]);

/**
 * Parses a combo string like "mod+shift+k" into its parts. Throws rather than
 * returning some "invalid" sentinel — a malformed binding must fail loudly at
 * registration time, not silently never fire because nothing ever compared
 * true against it.
 */
export function parseCombo(combo: string): ParsedCombo {
  const trimmed = combo.trim();
  if (trimmed === "") {
    throw new Error(`parseCombo: combo string is empty`);
  }

  const segments = trimmed.split("+").map((segment) => segment.trim().toLowerCase());
  const key = segments[segments.length - 1];

  // A trailing "+" (e.g. "shift+") yields an empty final segment; a combo
  // that names only modifiers (e.g. "shift+alt") has no real key either way —
  // both are the same authoring mistake: there is nothing to actually press.
  if (key === "" || MODIFIER_SEGMENTS.has(key)) {
    throw new Error(`parseCombo: "${combo}" has no key, only modifiers`);
  }

  const parsed: ParsedCombo = { key, mod: false, shift: false, alt: false };

  for (const segment of segments.slice(0, -1)) {
    if (segment === "mod") parsed.mod = true;
    else if (segment === "shift") parsed.shift = true;
    else if (segment === "alt") parsed.alt = true;
    else throw new Error(`parseCombo: unknown modifier "${segment}" in "${combo}"`);
  }

  return parsed;
}

function normaliseEventKey(key: string): string {
  const lower = key.toLowerCase();
  return lower === " " ? "space" : lower;
}

/**
 * True for a key whose character already encodes whether Shift was held — "?"
 * is what Shift+"/" produces, so also demanding `shiftKey === false` means the
 * binding can never match anything.
 *
 * Letters are excluded because their case is normalised away ("k" and "K" both
 * become "k"), leaving `shiftKey` as the only way to tell "k" from "shift+k".
 */
function shiftIsImpliedByKey(key: string): boolean {
  return key.length === 1 && !/[a-z0-9]/.test(key);
}

/**
 * Exact modifier match — not "at least these modifiers held". A bare "1"
 * binding must NOT fire on Cmd+1 (that's the browser's tab-switching chord),
 * and "mod+k" must not fire on Cmd+Shift+K either. So the platform's OWN mod
 * key must match exactly, and the OTHER platform's mod key must never be
 * held at all — holding Ctrl on macOS while a binding maps mod → Cmd is a
 * different physical chord, not a looser match of the same one.
 */
export function matchesCombo(event: KeyboardEvent, parsed: ParsedCombo, isMac: boolean): boolean {
  if (normaliseEventKey(event.key) !== parsed.key) return false;

  const modKeyPressed = isMac ? event.metaKey : event.ctrlKey;
  const otherModKeyPressed = isMac ? event.ctrlKey : event.metaKey;
  if (otherModKeyPressed) return false;
  if (modKeyPressed !== parsed.mod) return false;

  if (!shiftIsImpliedByKey(parsed.key) && event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;

  return true;
}

const ARROW_DISPLAY: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

function displayKey(key: string): string {
  if (key === "space") return "Space";
  if (key === "escape") return "Esc";
  const arrow = ARROW_DISPLAY[key];
  if (arrow) return arrow;
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * Display form for a cheat sheet. macOS renders the familiar symbol cluster
 * with no separators (⌘⇧K); everywhere else spells out the modifier names
 * (Ctrl+Shift+K) since there's no equivalent glyph convention.
 */
export function formatCombo(combo: string, isMac: boolean): string {
  const parsed = parseCombo(combo);
  const key = displayKey(parsed.key);

  if (isMac) {
    let out = "";
    if (parsed.mod) out += "⌘";
    if (parsed.shift) out += "⇧";
    if (parsed.alt) out += "⌥";
    return out + key;
  }

  const parts: string[] = [];
  if (parsed.mod) parts.push("Ctrl");
  if (parsed.shift) parts.push("Shift");
  if (parsed.alt) parts.push("Alt");
  parts.push(key);
  return parts.join("+");
}

const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "button", "submit"]);

/**
 * True when firing a hotkey here would eat a keystroke the user meant for a
 * field. Covers native form controls plus tiptap's `contenteditable`
 * `div.ProseMirror` — the `closest()` walk is needed because `isContentEditable`
 * is inherited in spec but not reliably reported on every descendant across
 * DOM implementations, and a rich-text mark (bold/italic span) nested inside
 * the editor must count as "inside" just as much as the editor root does.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;

  if (target.tagName === "INPUT") {
    const type = (target as HTMLInputElement).type.toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }

  if (target.isContentEditable) return true;
  return target.closest("[contenteditable='true']") !== null;
}

/** Guarded for a missing `navigator` (SSR, non-browser test contexts). */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  // navigator.platform is deprecated but still the most direct signal where
  // present; userAgent is the fallback for environments that leave it blank.
  return /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent);
}
