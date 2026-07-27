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

let listenerAttached = false;
const isMac = isMacPlatform();

function addRegistration(registration: Registration): void {
  registrations.value = [...registrations.value, registration];
  if (!listenerAttached) {
    document.addEventListener("keydown", handleKeydown);
    listenerAttached = true;
  }
}

function removeRegistration(registration: Registration): void {
  registrations.value = registrations.value.filter((r) => r !== registration);
  if (registrations.value.length === 0 && listenerAttached) {
    document.removeEventListener("keydown", handleKeydown);
    listenerAttached = false;
  }
}

function combosEqual(a: ReturnType<typeof parseCombo>, b: ReturnType<typeof parseCombo>): boolean {
  return a.key === b.key && a.mod === b.mod && a.shift === b.shift && a.alt === b.alt;
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

function findMatch(layer: HotkeyLayer, event: KeyboardEvent, inTextEntry: boolean): HotkeyBinding | null {
  // Iterate in registration order and let later matches overwrite earlier
  // ones, so "most recently registered wins" falls out for free.
  let winner: HotkeyBinding | null = null;
  for (const registration of registrations.value) {
    if (registration.layer !== layer) continue;
    if (!toValue(registration.enabled)) continue;
    for (const binding of toValue(registration.bindings)) {
      if (inTextEntry && !binding.allowInTextEntry) continue;
      if (matchesCombo(event, parseCombo(binding.combo), isMac)) winner = binding;
    }
  }
  return winner;
}

function handleKeydown(event: KeyboardEvent): void {
  // IME composition (e.g. a Japanese/Chinese user picking a candidate) fires
  // keydown events that aren't the user "pressing a key" in the shortcut
  // sense — acting on them would fire hotkeys mid-composition.
  if (event.isComposing) return;

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
      match.handler(event);
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
