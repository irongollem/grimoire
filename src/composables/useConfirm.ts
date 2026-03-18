import { ref } from "vue";

interface DialogState {
  type: "confirm" | "alert";
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (value: boolean) => void;
}

// Module-level singleton — one dialog at a time, shared across all components
const dialog = ref<DialogState | null>(null);

function _open(state: Omit<DialogState, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.value = { ...state, resolve };
  });
}

export function useConfirm() {
  /** Confirmation dialog — resolves true if the user clicks the confirm button. */
  function confirm(
    message: string,
    options?: { title?: string; confirmLabel?: string; danger?: boolean },
  ): Promise<boolean> {
    return _open({
      type: "confirm",
      title: options?.title ?? "Are you sure?",
      message,
      confirmLabel: options?.confirmLabel ?? "Confirm",
      danger: options?.danger ?? true,
    });
  }

  /** Informational alert dialog — single OK button. */
  function notify(message: string, title = "Notice"): Promise<void> {
    return _open({ type: "alert", title, message, confirmLabel: "OK", danger: false }).then(
      () => undefined,
    );
  }

  function _resolve(value: boolean) {
    dialog.value?.resolve(value);
    dialog.value = null;
  }

  return { confirm, notify, dialog, _resolve };
}
