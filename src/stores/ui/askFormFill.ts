/**
 * The forms open on the page that an Ask card can fill (#1270): an editor's own Generate (a new NPC, monster or spell)
 * and the calendar's Draft with AI do not make a record, they write into the form the DM is looking at. The page
 * registers a filler while its form is open (`useAskFormFill`), the card's adapter finds it here and hands it the
 * generated values. Not a filter and not persisted.
 *
 * A form that closes while the run is still going has nowhere to put what was paid for. The result is kept here for the
 * next time that same form opens (`keep`, taken by `useAskFormFill`), for a few minutes: long enough to reopen the
 * editor, short enough that it never fills a form the DM opened an hour later for something else.
 */
import { defineStore } from "pinia";
import { shallowRef } from "vue";

/** What a page gives the card for one generator: what the form knows (`context`) and how it takes a result (`apply`). */
export interface FormFiller<R, C = undefined> {
  context: () => C;
  apply: (result: R) => void;
}

/** How long a result kept for a closed form waits for it to open again. */
export const KEPT_RESULT_TTL_MS = 10 * 60_000;

interface Kept {
  result: unknown;
  at: number;
}

export const useAskFormFillStore = defineStore("ui:askFormFill", () => {
  // Replaced, never mutated, so a quote reading `fillerFor` re-runs when a form opens or closes.
  const fillers = shallowRef<Readonly<Record<string, FormFiller<unknown, unknown>>>>({});
  const kept = shallowRef<Readonly<Record<string, Kept>>>({});

  /**
   * The id pairs a generator with its form, so the types on both sides are the one `R` and `C` that generator's
   * adapter and its page agree on; the store holds them as `unknown` and each side narrows with the same pair.
   */
  function register<R, C>(generatorId: string, filler: FormFiller<R, C>): void {
    fillers.value = {
      ...fillers.value,
      [generatorId]: { context: filler.context, apply: (result) => filler.apply(result as R) },
    };
  }

  /** Removes `filler` only if it is still the one registered: a form that mounted after this one keeps its place. */
  function unregister<R, C>(generatorId: string, filler: FormFiller<R, C>): void {
    const current = fillers.value[generatorId];
    if (!current || current.context !== filler.context) return;
    const { [generatorId]: _gone, ...rest } = fillers.value;
    fillers.value = rest;
  }

  function fillerFor<R, C>(generatorId: string): FormFiller<R, C> | null {
    const found = fillers.value[generatorId];
    if (!found) return null;
    return { context: () => found.context() as C, apply: (result) => found.apply(result) };
  }

  /** Holds a result no form was open to take. */
  function keep(generatorId: string, result: unknown): void {
    kept.value = { ...kept.value, [generatorId]: { result, at: Date.now() } };
  }

  /** The result held for this form, once: null when there is none or it went stale. */
  function takeKept<R>(generatorId: string): R | null {
    const held = kept.value[generatorId];
    if (!held) return null;
    const { [generatorId]: _taken, ...rest } = kept.value;
    kept.value = rest;
    return Date.now() - held.at <= KEPT_RESULT_TTL_MS ? (held.result as R) : null;
  }

  return { fillers, register, unregister, fillerFor, keep, takeKept };
});
