// Z, D, F, E on the Zoning tab (#1125 frame 19). The editor's own key handler (`useMapCanvasEditor`) only knows the
// Drawing's tools, and three of these letters are Drawing shortcuts too (D door, F fill, E eraser). This listens on
// the capture phase of the window, so it answers first on Zoning and stops the Drawing's tool from also being picked
// behind the DM's back; on any other tab it does nothing and the editor's handler sees the key as before.

import { onBeforeUnmount, onMounted } from "vue";
import { resolveZoningKey, type EditorLayer } from "@/cartographer/keymap";
import { isTextEntry } from "@/lib/canvasControls/keyTargets";

export function useZoningKeys<T extends string>(opts: {
  layer: () => EditorLayer;
  /** False in view mode and wherever the page has no editor (a key must never be taken from a plain page). */
  enabled: () => boolean;
  tools: ReadonlyArray<{ id: T; shortcut: string }>;
  pick: (tool: T) => void;
}): void {
  function onKeyDown(ev: KeyboardEvent): void {
    if (!opts.enabled()) return;
    const tool = resolveZoningKey(
      {
        key: ev.key,
        code: ev.code,
        ctrlKey: ev.ctrlKey,
        metaKey: ev.metaKey,
        altKey: ev.altKey,
        shiftKey: ev.shiftKey,
        targetIsTextEntry: isTextEntry(ev.target),
      },
      opts.layer(),
      opts.tools,
    );
    if (tool === null) return;
    opts.pick(tool);
    ev.preventDefault();
    ev.stopPropagation();
  }
  onMounted(() => window.addEventListener("keydown", onKeyDown, true));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown, true));
}
