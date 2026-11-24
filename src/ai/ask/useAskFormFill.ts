/**
 * A page's side of "a card that fills the form open on the page" (#1270), the reverse of `useAskPrefill`: that one hands
 * a request to a screen, this one lets a card hand a generated result to a form. The form registers while it is open
 * (`active`, default: while the component is mounted) and is gone when it closes.
 *
 * Registering makes an instance token for this one form, and `bind` turns it into the `target` the page passes to its
 * Generate button (`openGenerator(id, { target: bind(...) })`). The card then fills this instance and nothing else:
 * a form of the same kind opened later is never filled by it, and a result for a closed form is shown on the card
 * (`landInForm`), not kept for another.
 *
 * `apply` writes the values into the form's own state and nothing else: no record is saved and nothing navigates, the
 * DM reviews the form and saves it as always.
 */
import { ref, watch } from "vue";
import type { AskRecordRef, AskRecordType } from "@edge-shared/agent/askContract";
import { useAskFormFillStore, type FormFiller } from "@/stores/ui/askFormFill";

export function useAskFormFill<R, C = undefined>(
  generatorId: string,
  filler: FormFiller<R, C>,
  active: () => boolean = () => true,
): {
  /** The card's `target` for this form: `type` is the nearest record type (the card never reads it), `name` what the quote shows. */
  bind: (type: AskRecordType, name: string) => AskRecordRef | undefined;
} {
  const store = useAskFormFillStore();
  const instance = ref<string | null>(null);
  watch(
    active,
    (open, _before, onCleanup) => {
      if (!open) return;
      const token = store.register(generatorId, filler);
      instance.value = token;
      onCleanup(() => {
        store.unregister(token);
        if (instance.value === token) instance.value = null;
      });
    },
    { immediate: true },
  );
  return {
    bind: (type, name) => (instance.value === null ? undefined : { type, id: instance.value, name }),
  };
}
