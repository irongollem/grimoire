import { watch, type Ref } from "vue";
import type { FightEffect } from "@/rules/fight/fightState";
import type { ConfirmedFight, PendingBatch } from "@/lib/encounters/fightSync";
import {
  FightRequestError,
  confirmedFromAnswer,
  isRetryable,
  postFightBatch,
  retryDelayMs,
  type FightAnswer,
} from "@/lib/encounters/fightWire";

/** How long `drain` waits for the batches made before it to reach the server before it gives up. */
export const DRAIN_TIMEOUT_MS = 15_000;

/**
 * How many failed tries of one batch in a row before the DM is told, once, that the changes are not saved. Five
 * tries is about half a minute of backing off: past a dropped signal in a lift, so what is left is a server that
 * keeps refusing, which the quiet retry would otherwise hide for as long as the DM kept playing.
 */
export const STUCK_AFTER_FAILURES = 5;

/** What the pump reads from and writes to the run store's link. */
export interface PumpHost {
  /** The encounter the attached fight belongs to; null when none is attached. Every batch waiting is for it. */
  encounterId(): string | null;
  nextBatch(): PendingBatch | null;
  hasQueued(): boolean;
  sendFailed(): void;
  sendSucceeded(): void;
  answered(batchId: string | null, answer: ConfirmedFight, effects: FightEffect[]): void;
  /** What was made after the last confirmed state is not coming back. */
  dropPending(): void;
  /** How many batches wait for the server; the page-leave prompt follows it. */
  unsent: Ref<number>;
}

/** What the DM is told, and by what means. */
export interface PumpToast {
  error(message: string): void;
  fromError(error: unknown, fallback: string): string;
}

/** Why the server will not take a fight's commands any more. */
export interface FightLostEvent {
  fightId: string;
  /** "ended" (409), "gone" (404) or "refused" (anything else that will not change). */
  reason: "ended" | "gone" | "refused";
  /** True when the store still holds this fight, so its pending commands were dropped and its screen is worth refreshing. */
  current: boolean;
}

/** Work the pump does between batches and in their order (the runner's party sync): never at the same time as a send. */
export interface IdleWork {
  pending(): boolean;
  run(): Promise<void>;
}

/** What the DM is told when a save went through but a write after it (a character's sheet, the chat) did not; null when all landed. */
export function failedWritesNotice(answer: FightAnswer): string | null {
  return answer.effectFailures.length > 0 ? "A character's sheet or the chat did not take the latest change. Check it before you carry on." : null;
}

/** Reported from a timer: a throw inside a listener does not reliably reach Sentry. */
function report(error: unknown) {
  setTimeout(() => { throw error; });
}

/**
 * The one sender of a fight's batches (#1201 stage 2c). It lives with the store that holds the batches, not with
 * the runner that happened to be mounted when they were made, so changes still unsent when the DM leaves the
 * runner keep being retried and keep the "leave this site?" prompt up until they are saved. Batches go one at a
 * time and in order, each to the encounter the store's fight belongs to (a batch is sealed in its fight, and a
 * fight that has taken over the store is the only one whose batches are left). A batch is sent with its id and
 * sent again with that SAME id after a failure, with backoff, so a reply lost after the server applied it cannot
 * apply it twice. The backoff is not a poll: it ends the moment the queue is empty.
 */
export function createBatchPump(host: PumpHost, toast: PumpToast) {
  let running = false;
  let stopped = false;
  let idleWork: IdleWork | null = null;
  /** The batch the DM was last told is stuck, so one batch is announced once however long it keeps failing. */
  let toldAboutBatch: string | null = null;
  const idleWaiters: Array<() => void> = [];
  const lostListeners = new Set<(event: FightLostEvent) => void>();
  /** Ends the backoff wait in progress, so a reset or a dispose does not leave a timer behind. */
  let endWait: (() => void) | null = null;

  function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        endWait = null;
        resolve();
      }
      endWait = done;
    });
  }

  /** Tells the DM the server will not take this fight's commands, and the listeners (a runner on screen) the same. */
  function lost(error: unknown, fightId: string) {
    // The store may have moved on to another fight while the request was out: its state is not this fight's to drop.
    const current = host.encounterId() === fightId;
    if (current) host.dropPending();
    const status = error instanceof FightRequestError ? error.status : null;
    const reason = status === 409 ? "ended" : status === 404 ? "gone" : "refused";
    if (reason === "ended") toast.error("This fight has ended, so your last changes were not saved.");
    else if (reason === "gone") toast.error("This fight is gone, so your last changes were not saved.");
    else toast.error(toast.fromError(error, "The server would not take your last changes. They were not saved."));
    for (const listener of lostListeners) listener({ fightId, reason, current });
  }


  async function run() {
    if (running || stopped) return;
    running = true;
    let failures = 0;
    let failingBatch: string | null = null;
    try {
      while (!stopped) {
        const owner = host.encounterId();
        const batch = owner === null ? null : host.nextBatch();
        if (batch && owner !== null) {
          if (batch.id !== failingBatch) {
            failingBatch = batch.id;
            failures = 0;
          }
          try {
            const answer = await postFightBatch(owner, batch.id, batch.commands);
            // The fight may have been put away or replaced while the request was out: its answer is nobody's now.
            if (host.encounterId() !== owner) continue;
            failures = 0;
            host.sendSucceeded();
            host.answered(batch.id, confirmedFromAnswer(answer), answer.effects);
            const notice = failedWritesNotice(answer);
            if (notice !== null) toast.error(notice);
          } catch (error) {
            if (host.encounterId() !== owner) continue;
            if (!isRetryable(error)) {
              lost(error, owner);
              return;
            }
            failures += 1;
            host.sendFailed();
            if (failures >= STUCK_AFTER_FAILURES && toldAboutBatch !== batch.id) {
              toldAboutBatch = batch.id;
              toast.error("Your latest changes could not be saved. Still trying.");
            }
            await sleep(retryDelayMs(failures));
          }
          continue;
        }
        if (idleWork?.pending()) {
          await idleWork.run();
          continue;
        }
        return;
      }
    } finally {
      running = false;
      for (const resolve of idleWaiters.splice(0)) resolve();
    }
  }

  function kick() {
    if (stopped) return;
    queueMicrotask(() => { run().catch(report); });
  }

  /** True while anything waits to be sent or is being sent. */
  function busy(): boolean {
    return running || host.hasQueued() || idleWork?.pending() === true;
  }

  /** Resolves true once nothing is waiting to be sent, false when that did not happen in time (offline). */
  async function drain(timeoutMs: number = DRAIN_TIMEOUT_MS): Promise<boolean> {
    if (!busy()) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<boolean>((resolve) => idleWaiters.push(() => resolve(true)));
    const timedOut = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
    kick();
    const finished = await Promise.race([idle, timedOut]);
    clearTimeout(timer);
    return finished && !host.hasQueued();
  }

  // The browser's "leave this site?" prompt while changes have not reached the server: a reload would lose them. It
  // is the pump's, so it stays up after the runner is gone and comes down only when the queue is empty.
  function warnBeforeLeaving(event: BeforeUnloadEvent) {
    if (!host.hasQueued()) return;
    event.preventDefault();
    // Older browsers show the prompt only when a value is set.
    event.returnValue = "";
  }
  function setGuard(on: boolean) {
    if (typeof window === "undefined") return;
    if (on) window.addEventListener("beforeunload", warnBeforeLeaving);
    else window.removeEventListener("beforeunload", warnBeforeLeaving);
  }
  const stopWatching = watch(() => host.unsent.value > 0, setGuard, { immediate: true });

  return {
    kick,
    busy,
    drain,
    /** A fight was put away: a backoff in progress ends now, and the loop finds nothing left to send. */
    fightChanged() {
      endWait?.();
    },
    /** The party sync, which goes between batches and never beside one. */
    setIdleWork(work: IdleWork | null) {
      idleWork = work;
    },
    /** The server will not take this fight's commands any more (a send, or the runner's own party sync, was refused). */
    refused: lost,
    onLost(listener: (event: FightLostEvent) => void): () => void {
      lostListeners.add(listener);
      return () => { lostListeners.delete(listener); };
    },
    /** The store is gone: nothing keeps a timer or a listener on the page. */
    dispose() {
      stopped = true;
      stopWatching();
      setGuard(false);
      endWait?.();
      lostListeners.clear();
    },
  };
}
