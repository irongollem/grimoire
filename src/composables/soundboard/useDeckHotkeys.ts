/**
 * The deck's keyboard (#1136): the same protocol as the screen and a Launchpad,
 * so a key does exactly what the pad under it does.
 *
 *   1 to 8      the top-row pad of lanes 1 to 8 (press, and release for Gate and Repeat)
 *   L S F O V E  the Loop, Stop, Fade, Solo, Volume and Edit tools: hold to borrow, tap to lock
 *   P           back to Play
 *   H           Hush: hold to dip the mix, tap to lock it
 *   X           stop everything
 *   Shift+F     fade everything out
 *
 * Hold-versus-tap is the rule the MIDI driver uses (`lib/audio/deck/holdTap.ts`).
 * Bound on the global layer, so the page layer of /soundboard still shadows
 * 1 to 9 and X there until that screen's own hotkeys are retired.
 *
 * No Space here, on purpose: the registry claims a key the moment a binding
 * matches, so a global Space would stop Space pressing buttons and scrolling
 * pages across the whole app. Pause all keeps its button.
 */

import { computed, type MaybeRefOrGetter } from "vue";
import { useHotkeys, type HotkeyBinding } from "@/composables/useHotkeys";
import { useDeck } from "@/composables/soundboard/useDeck";
import { DECK_LANES, type DeckAction, type DeckPhase, type DeckTool } from "@/lib/audio/deck/deckSurface";
import { createHoldTap } from "@/lib/audio/deck/holdTap";

export interface DeckHotkeyTarget {
  dispatch(action: DeckAction): void;
}

export interface DeckHotkeyOptions {
  /** Milliseconds, injectable for tests. */
  now?: () => number;
  enabled?: MaybeRefOrGetter<boolean>;
}

const TOOL_KEYS: ReadonlyArray<{ key: string; tool: DeckTool; label: string }> = [
  { key: "l", tool: "loop", label: "Loop" },
  { key: "s", tool: "stop", label: "Stop" },
  { key: "f", tool: "fade", label: "Fade" },
  { key: "o", tool: "solo", label: "Solo" },
  { key: "v", tool: "volume", label: "Volume" },
  { key: "e", tool: "edit", label: "Edit" },
];

export function useDeckHotkeys(target: DeckHotkeyTarget = useDeck(), options: DeckHotkeyOptions = {}): void {
  const buttons = createHoldTap(options.now ?? (() => Date.now()));

  const toolSender = (tool: DeckTool) => (phase: DeckPhase) => target.dispatch({ type: "tool", tool, phase });
  const hushSender = (phase: DeckPhase) => target.dispatch({ type: "hush", phase });

  const bindings = computed<HotkeyBinding[]>(() => {
    const list: HotkeyBinding[] = [];

    for (let lane = 0; lane < DECK_LANES; lane++) {
      list.push({
        combo: String(lane + 1),
        description: lane === 0 ? "Fire the top pad of lanes 1 to 8" : `Fire the top pad of lane ${lane + 1}`,
        hidden: lane !== 0,
        ignoreRepeat: true,
        handler: () => {
          buttons.padPressed();
          target.dispatch({ type: "press", lane, row: 0 });
        },
        onRelease: () => target.dispatch({ type: "release", lane, row: 0 }),
      });
    }

    for (const { key, tool, label } of TOOL_KEYS) {
      const send = toolSender(tool);
      list.push({
        combo: key,
        description: `${label} tool: hold to borrow, tap to lock`,
        ignoreRepeat: true,
        handler: () => buttons.edge(`tool:${tool}`, true, send),
        onRelease: () => buttons.edge(`tool:${tool}`, false, send),
      });
    }

    list.push(
      {
        combo: "p",
        description: "Back to the Play tool",
        handler: () => target.dispatch({ type: "tool", tool: "play", phase: "toggle" }),
      },
      {
        combo: "h",
        description: "Hush: hold to dip the mix, tap to lock",
        ignoreRepeat: true,
        handler: () => buttons.edge("hush", true, hushSender),
        onRelease: () => buttons.edge("hush", false, hushSender),
      },
      {
        combo: "x",
        description: "Stop everything",
        ignoreRepeat: true,
        handler: () => target.dispatch({ type: "stopAll" }),
      },
      {
        combo: "shift+f",
        description: "Fade everything out",
        ignoreRepeat: true,
        handler: () => target.dispatch({ type: "fadeAll" }),
      },
    );
    return list;
  });

  useHotkeys(bindings, { layer: "global", enabled: options.enabled });
}
