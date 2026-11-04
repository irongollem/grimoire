// App-wide keyboard-shortcut registry.
//
// Replaces the pattern where every shortcut (GlobalSearch's Cmd/Ctrl+K,
// ImageLightbox's Escape, the cartographer editor's tool hotkeys, ...) opens
// its own `document.addEventListener("keydown", ...)` with nothing aware of
// what anything else has bound. One shared listener here means a collision
// is detectable (dev warning) instead of one shortcut silently shadowing
// another, and `useActiveHotkeys` gives a cheat sheet something to render.
//
// State lives at module scope — same reasoning as `audioEngine.ts`'s bus
// graph and `soundTransport.ts`'s instance map: there is exactly one keydown
// listener for the whole page, not one per component instance, so it can't
// live inside a per-call closure.

import {
  computed,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
} from "vue";
import { formatCombo, isMacPlatform, isTextEntryTarget, matchesCombo, parseCombo } from "@/lib/hotkeys";
import type { ParsedCombo } from "@/lib/hotkeys";

export type HotkeyLayer = "global" | "page" | "overlay";

export interface HotkeyBinding {
  combo: string;
  /** Shown in the cheat sheet. Imperative voice: "Stop all audio". */
  description: string;
  handler: (event: KeyboardEvent) => void;
  /** Fire even while the user is typing. Default false. */
  allowInTextEntry?: boolean;
  /** Omit from the cheat sheet (e.g. an Escape handler). Default false. */
  hidden?: boolean;
  /**
   * Called when the key that fired this binding is let go. The release is
   * routed to the binding that took the keydown, whatever layers, registrations
   * or modifiers changed since. It also fires when the window blurs or the tab
   * hides while the key is held, and when the binding's registration is
   * disposed. In the last two cases the original keydown event is passed.
   */
  onRelease?: (event: KeyboardEvent) => void;
  /** Auto-repeat keydowns neither call `handler` nor reach another binding. Default false. */
  ignoreRepeat?: boolean;
}

interface HeldKey {
  binding: HotkeyBinding;
  registration: Registration;
  event: KeyboardEvent;
}

interface Registration {
  layer: HotkeyLayer;
  bindings: MaybeRefOrGetter<HotkeyBinding[]>;
  enabled: MaybeRefOrGetter<boolean>;
}

// Layer precedence when nothing suppresses the check entirely: page shadows
// global for the same physical combo, so a screen-specific "1" can override
// a page-agnostic default without the author having to know the default
// exists. Overlay isn't listed here — it's handled as a hard cutoff below,
// never falls through to it.
const FALLBACK_LAYER_ORDER: readonly HotkeyLayer[] = ["page", "global"];
const CHEAT_SHEET_LAYER_ORDER: Record<HotkeyLayer, number> = { overlay: 0, page: 1, global: 2 };

// `shallowRef` (not `ref`) so the Registration objects — and any Ref/getter a
// caller stashed on them — are stored as-is rather than deep-reactive-proxied.
// Mutations always replace `.value` with a new array, which is what makes
// `useActiveHotkeys`'s computed re-run on register/dispose.
const registrations = shallowRef<Registration[]>([]);

// Keys whose keydown a binding with `onRelease` took, by physical key.
const heldKeys = new Map<string, HeldKey>();

let listenerAttached = false;
const isMac = isMacPlatform();

function addRegistration(registration: Registration): void {
  registrations.value = [...registrations.value, registration];
  if (!listenerAttached) {
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("keyup", handleKeyup);
    window.addEventListener("blur", releaseAllHeld);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    listenerAttached = true;
  }
}

function heldKeyId(event: KeyboardEvent): string {
  return event.code ? event.code : event.key.toLowerCase();
}

function releaseHeld(id: string, held: HeldKey, event: KeyboardEvent): void {
  // Delete first so a throwing onRelease cannot leave the key stuck.
  if (heldKeys.get(id) === held) heldKeys.delete(id);
  held.binding.onRelease?.(event);
}

function releaseAllHeld(): void {
  for (const [id, held] of Array.from(heldKeys)) releaseHeld(id, held, held.event);
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "hidden") releaseAllHeld();
}

function handleKeyup(event: KeyboardEvent): void {
  if (typeof event.key !== "string") return;
  const id = heldKeyId(event);
  const held = heldKeys.get(id);
  if (held) releaseHeld(id, held, event);
}

function removeRegistration(registration: Registration): void {
  for (const [id, held] of Array.from(heldKeys)) {
    if (held.registration === registration) releaseHeld(id, held, held.event);
  }
  registrations.value = registrations.value.filter((r) => r !== registration);
  if (registrations.value.length === 0 && listenerAttached) {
    document.removeEventListener("keydown", handleKeydown);
    document.removeEventListener("keyup", handleKeyup);
    window.removeEventListener("blur", releaseAllHeld);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    listenerAttached = false;
  }
}

function combosEqual(a: ReturnType<typeof parseCombo>, b: ReturnType<typeof parseCombo>): boolean {
  return a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
}

/**
 * Escape in the overlay layer is the one collision that is not one.
 *
 * Every dismissable overlay binds Escape to close itself, and when they stack —
 * a dialog opened from a palette — the topmost *should* shadow the one beneath,
 * then hand it back on unmount. That is the intended behaviour of the layer,
 * not an accident to report.
 *
 * Warning about it anyway cost more than it found: the message fired on
 * ordinary use, and a warning that cries wolf is how a real collision (two
 * different actions on one combo) gets scrolled past.
 */
function isExpectedDismissStack(registration: Registration, combo: ParsedCombo): boolean {
  return registration.layer === "overlay" && combo.key === "escape";
}

/**
 * Dev-only visibility into the whole point of having a registry: a silent
 * shadow is exactly what ad-hoc listeners couldn't detect. Checked from the
 * perspective of whichever registration's bindings just changed, against
 * every OTHER registration already sharing its layer.
 */
function warnOnCollisions(registration: Registration, bindings: HotkeyBinding[]): void {
  if (!import.meta.env.DEV) return;

  for (const binding of bindings) {
    const parsed = parseCombo(binding.combo);
    if (isExpectedDismissStack(registration, parsed)) continue;
    for (const other of registrations.value) {
      if (other === registration || other.layer !== registration.layer) continue;
      for (const otherBinding of toValue(other.bindings)) {
        if (!combosEqual(parsed, parseCombo(otherBinding.combo))) continue;
        console.warn(
          `useHotkeys: "${formatCombo(binding.combo, isMac)}" in layer "${registration.layer}" is already bound ` +
            `to "${otherBinding.description}" — new binding "${binding.description}" will shadow it.`,
        );
      }
    }
  }
}

interface Match {
  binding: HotkeyBinding;
  registration: Registration;
}

function findMatch(layer: HotkeyLayer, event: KeyboardEvent, inTextEntry: boolean): Match | null {
  // Iterate in registration order and let later matches overwrite earlier
  // ones, so "most recently registered wins" falls out for free.
  let winner: Match | null = null;
  for (const registration of registrations.value) {
    if (registration.layer !== layer) continue;
    if (!toValue(registration.enabled)) continue;
    for (const binding of toValue(registration.bindings)) {
      if (inTextEntry && !binding.allowInTextEntry) continue;
      if (matchesCombo(event, parseCombo(binding.combo), isMac)) winner = { binding, registration };
    }
  }
  return winner;
}

function handleKeydown(event: KeyboardEvent): void {
  // IME composition (e.g. a Japanese/Chinese user picking a candidate) fires
  // keydown events that aren't the user "pressing a key" in the shortcut
  // sense — acting on them would fire hotkeys mid-composition.
  if (event.isComposing) return;

  // `KeyboardEvent.key` is typed `string`, and the DOM's typing is lying: this
  // is a document-level listener, so anything on the page may dispatch a
  // synthetic "keydown" at it — a password manager, an accessibility tool, a
  // browser extension. A plain `new Event("keydown")` carries no `key` at all,
  // and TypeScript cannot see that because the listener is handed a
  // `KeyboardEvent` by declaration rather than by check.
  //
  // That is how `normaliseEventKey` came to call `.toLowerCase()` on undefined
  // in production (18 Sep 2026, on /dashboard). Guarded here rather than inside
  // the matcher because this is where untrusted input enters, and the matcher
  // runs once per registered binding — the check belongs once per event, not
  // once per comparison. An event with no key can match no binding, so there is
  // nothing to do but leave.
  if (typeof event.key !== "string") return;

  const inTextEntry = isTextEntryTarget(event.target);

  const overlayActive = registrations.value.some(
    (r) => r.layer === "overlay" && toValue(r.enabled) && toValue(r.bindings).length > 0,
  );

  // A palette being open must stop page/global bindings (e.g. 1-9 firing
  // sounds on the page behind it) even for keys the overlay itself doesn't
  // bind — so this is a hard cutoff, not just a precedence bump.
  const layerOrder = overlayActive ? (["overlay"] as const) : FALLBACK_LAYER_ORDER;

  for (const layer of layerOrder) {
    const match = findMatch(layer, event, inTextEntry);
    if (match) {
      event.preventDefault();
      const { binding, registration } = match;
      if (event.repeat && binding.ignoreRepeat) return;
      if (binding.onRelease) {
        const id = heldKeyId(event);
        const previous = heldKeys.get(id);
        // A different binding still holding this key (layers changed between
        // two presses with no keyup) is released before the new one takes it.
        if (previous && previous.binding !== binding) releaseHeld(id, previous, event);
        heldKeys.set(id, { binding, registration, event });
      }
      binding.handler(event);
      return; // exactly one handler per event
    }
  }
}

/**
 * Registers a set of hotkeys for as long as the current effect scope lives —
 * a component unmounting (or an explicit `effectScope.stop()` in tests) drops
 * its bindings with no explicit teardown call required.
 *
 * `bindings`/`enabled` accept refs or getters so a caller can, say, only
 * enable a binding set while a panel is open without re-registering.
 */
export function useHotkeys(
  bindings: MaybeRefOrGetter<HotkeyBinding[]>,
  options?: { layer?: HotkeyLayer; enabled?: MaybeRefOrGetter<boolean> },
): void {
  const registration: Registration = {
    layer: options?.layer ?? "page",
    bindings,
    enabled: options?.enabled ?? true,
  };

  // Validate (parseCombo throws on a malformed combo) and check for
  // collisions as a plain synchronous call BEFORE touching any shared state.
  // This must throw directly to the caller rather than going through Vue's
  // watcher error handling, which only rethrows in dev builds and merely
  // logs in production — a registration-time bug needs to fail the same way
  // in both. Doing it first also means a throw here leaves no half-registered
  // listener or stale entry behind to clean up.
  validateBindings(registration, toValue(bindings));

  addRegistration(registration);
  onScopeDispose(() => removeRegistration(registration));

  // Re-validate whenever the binding list changes reactively — e.g. a
  // computed source that only introduces a shortcut once some condition
  // becomes true. The initial check above already covers registration time.
  watch(() => toValue(bindings), (list) => validateBindings(registration, list));
}

function validateBindings(registration: Registration, list: HotkeyBinding[]): void {
  for (const binding of list) parseCombo(binding.combo);
  warnOnCollisions(registration, list);
}

/** Reactive, deduped, sorted list of what is currently bound — for a cheat sheet. */
export function useActiveHotkeys(): ComputedRef<
  { layer: HotkeyLayer; combo: string; display: string; description: string }[]
> {
  return computed(() => {
    const byIdentity = new Map<
      string,
      { layer: HotkeyLayer; combo: string; display: string; description: string }
    >();

    for (const registration of registrations.value) {
      if (!toValue(registration.enabled)) continue;
      for (const binding of toValue(registration.bindings)) {
        if (binding.hidden) continue;
        const parsed = parseCombo(binding.combo);
        // Same identity as the runtime match: same layer + same physical
        // combo. The Map keeps insertion order per key, and since later
        // registrations overwrite earlier entries here too, a same-layer
        // collision shows the binding that would actually fire.
        const identity = `${registration.layer}:${parsed.mod}:${parsed.shift}:${parsed.alt}:${parsed.key}`;
        byIdentity.set(identity, {
          layer: registration.layer,
          combo: binding.combo,
          display: formatCombo(binding.combo, isMac),
          description: binding.description,
        });
      }
    }

    return Array.from(byIdentity.values()).sort((a, b) => {
      const layerDiff = CHEAT_SHEET_LAYER_ORDER[a.layer] - CHEAT_SHEET_LAYER_ORDER[b.layer];
      return layerDiff !== 0 ? layerDiff : a.display.localeCompare(b.display);
    });
  });
}
