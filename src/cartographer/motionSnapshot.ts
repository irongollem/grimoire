// When the editor rebuilds the snapshot its motion plays from (#1125 frames 16-17). While motion plays the still canvas
// leaves out every swaying prop and door leaf, so a prop the DM moves exists on screen only as the snapshot's sprite:
// a snapshot that lags an edit makes it vanish or jump. So an edit that is finished (a click, a stamp, an undo) is
// rebuilt at once, and only a drag in progress, which changes the layers on every pointer move, is throttled to one
// rebuild per interval, with the last state of the drag still guaranteed one at the end. No vue, no DOM.

export interface SnapshotTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface SnapshotScheduler {
  /** The layers changed. `busy` is a gesture still under way (a drag, a held stroke). */
  changed: (busy: boolean) => void;
  /** The gesture ended: whatever it left unbuilt is built now. */
  settled: () => void;
  /** Build now, whether or not anything changed (motion just started playing). */
  flush: () => void;
  cancel: () => void;
}

export function createSnapshotScheduler(
  rebuild: () => void,
  intervalMs: number,
  timers: SnapshotTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
): SnapshotScheduler {
  let pending = false;
  let timer: unknown = null;

  function build(): void {
    if (timer !== null) timers.clear(timer);
    timer = null;
    pending = false;
    rebuild();
  }

  return {
    changed(busy) {
      pending = true;
      if (!busy) return build();
      // A throttle, not a debounce: a drag never goes quiet, and waiting for quiet is the vanishing this prevents.
      if (timer === null) timer = timers.set(() => { timer = null; if (pending) build(); }, intervalMs);
    },
    settled() {
      if (pending) build();
    },
    flush: build,
    cancel() {
      if (timer !== null) timers.clear(timer);
      timer = null;
      pending = false;
    },
  };
}
