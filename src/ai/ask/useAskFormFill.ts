/**
 * A page's side of "a card that fills the form open on the page" (#1270), the reverse of `useAskPrefill`: that one hands
 * a request to a screen, this one lets a card hand a generated result to a form. The form registers while it is open
 * (`active`, default: while the component is mounted) and is gone when it closes; a result that was paid for while no
 * form was open and kept for it (the DM closed the editor mid-run) is applied the moment the same form opens again.
 *
 * `apply` writes the values into the form's own state and nothing else: no record is saved and nothing navigates, the
 * DM reviews the form and saves it as always. A kept result is applied after the component has finished setting up, so
 * `apply` may read state declared further down the page's script.
 */
import { nextTick, watch } from "vue";
import { useAskFormFillStore, type FormFiller } from "@/stores/ui/askFormFill";

export function useAskFormFill<R, C = undefined>(
  generatorId: string,
  filler: FormFiller<R, C>,
  active: () => boolean = () => true,
): void {
  const store = useAskFormFillStore();
  watch(
    active,
    (open, _before, onCleanup) => {
      if (!open) return;
      store.register(generatorId, filler);
      onCleanup(() => store.unregister(generatorId, filler));
      void nextTick(() => {
        const waiting = store.takeKept<R>(generatorId);
        if (waiting !== null) filler.apply(waiting);
      });
    },
    { immediate: true },
  );
}
