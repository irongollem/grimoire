/**
 * The forms open on the page that an Ask card can fill (#1270): an editor's own Generate (a new NPC, monster or spell)
 * and the calendar's Draft with AI do not make a record, they write into the form the DM is looking at. The page
 * registers a filler while its form is open (`useAskFormFill`) and gets an instance token for that one form; the card
 * it opens carries the token, and the card's adapter finds the filler by it and hands it the generated values. Not a
 * filter and not persisted.
 *
 * The token is the point. A result applies to the form instance that opened the card and to no other: a form of the
 * same kind that happens to be open when the run ends (an existing NPC's, after a cancelled new-NPC run) is not the
 * one the DM asked, and a result is never held for "the next one that opens" either. When that form is gone, the card
 * shows the values instead (`landInForm`).
 */
import { defineStore } from "pinia";
import { shallowRef } from "vue";

/** What a page gives the card for one generator: what the form knows (`context`) and how it takes a result (`apply`). */
export interface FormFiller<R, C = undefined> {
  context: () => C;
  apply: (result: R) => void;
}

/** Every token starts with this, so a card's `target.id` is recognisably a form instance and never a record id. */
export const FORM_INSTANCE_PREFIX = "form:";

interface Registered {
  generatorId: string;
  filler: FormFiller<unknown, unknown>;
}

export const useAskFormFillStore = defineStore("ui:askFormFill", () => {
  // Replaced, never mutated, so a quote reading `fillerFor` re-runs when a form opens or closes.
  const forms = shallowRef<Readonly<Record<string, Registered>>>({});
  let sequence = 0;

  /**
   * The id pairs a generator with its form, so the types on both sides are the one `R` and `C` that generator's
   * adapter and its page agree on; the store holds them as `unknown` and each side narrows with the same pair.
   * Returns the form's instance token.
   */
  function register<R, C>(generatorId: string, filler: FormFiller<R, C>): string {
    sequence += 1;
    const instance = `${FORM_INSTANCE_PREFIX}${sequence}`;
    forms.value = {
      ...forms.value,
      [instance]: { generatorId, filler: { context: filler.context, apply: (result) => filler.apply(result as R) } },
    };
    return instance;
  }

  function unregister(instance: string): void {
    if (!(instance in forms.value)) return;
    const { [instance]: _gone, ...rest } = forms.value;
    forms.value = rest;
  }

  /** The filler of exactly this form instance, or null when it is gone, was never one, or is another generator's. */
  function fillerFor<R, C>(generatorId: string, instance: string | null): FormFiller<R, C> | null {
    if (instance === null) return null;
    const found = forms.value[instance];
    if (!found || found.generatorId !== generatorId) return null;
    const { filler } = found;
    return { context: () => filler.context() as C, apply: (result) => filler.apply(result) };
  }

  return { forms, register, unregister, fillerFor };
});
