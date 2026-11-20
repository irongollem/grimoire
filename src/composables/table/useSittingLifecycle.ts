import { computed, ref, watch } from "vue";
import { useDocumentVisibility, useIntervalFn } from "@vueuse/core";
import { useQueryClient } from "@tanstack/vue-query";
import { useRouter } from "vue-router";
import { useLeaveTable } from "@/composables/table/useLeaveTable";
import { TABLE_SESSIONS_KEY } from "@/composables/table/useTableSessions";
import { useToast } from "@/composables/useToast";
import { endedByPause, offersNewSitting, type NotNow } from "@/lib/table/solo/sittingLength";
import type { TurnFailure } from "@/lib/table/solo/turnRefusal";
import { useAppUiStore } from "@/stores/ui/app";

/** What the sitting's lifecycle reads from the page, as getters so none of it is read before it exists. */
export interface SittingLifecycleDeps {
  campaignId: () => string | null;
  /** The conversation this page is on; null until a first turn creates it. */
  sessionId: () => string | null;
  /** The stored sitting's two moments, once it has been read. */
  sitting: () => { created_at: string; updated_at: string } | undefined;
  hasLeft: () => boolean;
  inFight: () => boolean;
  running: () => boolean;
  /** Whether a roll is being waited on. */
  asking: () => boolean;
  /** How many turns the player has taken. */
  turns: () => number;
  failure: () => TurnFailure | null;
  stopTurn: () => void;
  stopVoice: () => void;
}

/**
 * How a sitting at the table ends: the clock it is measured by, the long-sitting offer, the idle end, and getting up
 * (`sittingLength.ts` holds the rules; this holds the page's side of them).
 */
export function useSittingLifecycle(deps: SittingLifecycleDeps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const appUi = useAppUiStore();
  const leaveTable = useLeaveTable();

  // How long this sitting is and how long it has stood idle (`sittingLength.ts`). A reopened sitting brings both
  // from its row; a new one starts when this page did. `lastActive` moves with every turn that finishes here.
  const mountedMs = Date.now();
  // The time, by the minute, and at once when the page is looked at again: a laptop that slept runs no timers, so
  // waking is the moment that matters.
  const nowMs = ref(Date.now());
  useIntervalFn(() => (nowMs.value = Date.now()), 60_000);
  const visibility = useDocumentVisibility();
  watch(visibility, (state) => {
    if (state === "visible") nowMs.value = Date.now();
  });
  const startedMs = computed(() => {
    const stored = deps.sitting();
    return stored === undefined ? mountedMs : Date.parse(stored.created_at);
  });
  const lastActiveMs = ref<number | null>(null);
  watch(
    () => deps.sitting(),
    (stored) => {
      if (stored !== undefined && lastActiveMs.value === null) lastActiveMs.value = Date.parse(stored.updated_at);
    },
    { immediate: true },
  );
  watch(
    () => deps.running(),
    (running) => {
      if (!running) lastActiveMs.value = Date.now();
    },
  );

  // A sitting that has gone on for a long time is offered a new one; never in a fight, which a new sitting would drop.
  const notNow = ref<NotNow | null>(null);
  const offersNew = computed(
    () =>
      deps.sessionId() !== null &&
      !deps.hasLeft() &&
      !deps.inFight() &&
      !deps.running() &&
      !deps.asking() &&
      offersNewSitting({ startedMs: Number.isNaN(startedMs.value) ? null : startedMs.value, turns: deps.turns(), nowMs: nowMs.value, notNow: notNow.value }),
  );
  /** "Not now" to the offer: asked again after more play, measured from here. */
  function putOff(): void {
    notNow.value = { atMs: Date.now(), turns: deps.turns() };
  }

  // A long pause ended the sitting: the laptop slept, or the tab was left open overnight. The page gets up the way
  // the Leave button does, so the notes are written, and says why. Checked as time passes and the moment the page is
  // looked at again, so the player is told before typing a turn the server would refuse.
  let endingAway = false;
  async function endAway(): Promise<void> {
    if (endingAway) return;
    endingAway = true;
    toast.info("This sitting ended while you were away, and its notes are written. Sit down again to pick the story up.", 12_000);
    await leave();
  }
  watch(
    [() => nowMs.value, lastActiveMs, () => deps.sessionId()],
    ([now, last, id]) => {
      if (id !== null && !deps.hasLeft() && !deps.running() && endedByPause(last, now)) void endAway();
    },
    { immediate: true },
  );
  // The server said so first (a turn sent from a page that had not noticed yet).
  watch(
    () => deps.failure(),
    (failure) => {
      if (failure?.action === "ended") void endAway();
    },
  );

  async function leave(): Promise<void> {
    // A conversation that does not exist yet has nothing to end. A turn still running is stopped first: it would
    // otherwise be refused by the server the moment the sitting is marked left.
    deps.stopTurn();
    const id = deps.sessionId();
    const campaignId = deps.campaignId();
    if (id !== null && campaignId !== null) {
      const outcome = await leaveTable.leave(campaignId, id);
      // Never stuck at a table: a failed call is said and the player goes anyway.
      if (outcome === null) toast.error("Leaving the table could not be recorded. The session may still be running; end it from the Sessions page.");
      else void queryClient.invalidateQueries({ queryKey: [TABLE_SESSIONS_KEY] });
    }
    deps.stopVoice();
    // Getting up from the table is going back to being the Dungeon Master.
    appUi.exitTablePlay();
    await router.push("/table");
  }

  return { leaving: leaveTable.leaving, offersNew, putOff, leave };
}
