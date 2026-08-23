import { ref } from "vue";

export type ToastType = "error" | "success" | "info";

export interface ToastAction {
  /** Visible label on the toast's action button, e.g. "Undo". */
  label: string;
  /**
   * Invoked at most once — `push()` wraps this so a second click (or two fast
   * clicks before the toast unmounts) is a no-op. The toast dismisses itself
   * right after the wrapped callback runs, so a caller's `run` only needs to
   * perform the undo itself.
   */
  run: () => void;
}

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  /** Auto-dismiss delay in ms; 0 keeps it until manually dismissed. */
  duration: number;
  action?: ToastAction;
}

interface ToastOptions {
  action?: ToastAction;
}

// Module-level singleton so every caller shares one stack (same pattern as
// useConfirm). The <ToastHost> mounted once in App.vue renders `toasts`.
const toasts = ref<Toast[]>([]);
let nextId = 0;

// An action toast asks the user to make a decision (undo or don't), which takes
// longer than reading a plain notification — so it gets a longer floor than any
// of the three plain-toast defaults below, regardless of type. Callers can still
// pass an explicit duration (including 0, to require manual dismissal) to override it.
const ACTION_DEFAULT_DURATION = 8000;

function resolveDuration(defaultDuration: number, duration: number | undefined, hasAction: boolean): number {
  if (duration !== undefined) return duration;
  return hasAction ? ACTION_DEFAULT_DURATION : defaultDuration;
}

function push(type: ToastType, message: string, duration: number, action?: ToastAction): number {
  const id = ++nextId;
  // Wrap here, not at the call site or in ToastHost: this is the one place every
  // push funnels through, so it is the one place that can guarantee the callback
  // fires at most once no matter how many times the rendered button is clicked.
  let hasRun = false;
  const wrappedAction: ToastAction | undefined = action
    ? {
        label: action.label,
        run: () => {
          if (hasRun) return;
          hasRun = true;
          // `finally`, because `hasRun` is already spent by the time the
          // callback can throw: without it a failed undo would leave the toast
          // on screen wearing a button that can never do anything again.
          // Reporting the failure is the caller's job — its own toast.
          try {
            action.run();
          } finally {
            dismiss(id);
          }
        },
      }
    : undefined;
  toasts.value = [...toasts.value, { id, type, message, duration, action: wrappedAction }];
  return id;
}

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export function useToast() {
  /** Error toast — sticks around longer since the user needs to read/act on it. */
  function error(message: string, duration?: number, options?: ToastOptions) {
    return push("error", message, resolveDuration(7000, duration, Boolean(options?.action)), options?.action);
  }
  function success(message: string, duration?: number, options?: ToastOptions) {
    return push("success", message, resolveDuration(3500, duration, Boolean(options?.action)), options?.action);
  }
  function info(message: string, duration?: number, options?: ToastOptions) {
    return push("info", message, resolveDuration(4500, duration, Boolean(options?.action)), options?.action);
  }
  /** Normalise an unknown thrown value into a human-readable message. */
  function fromError(e: unknown, fallback = "Something went wrong."): string {
    if (e instanceof Error && e.message) return e.message;
    if (typeof e === "string" && e) return e;
    return fallback;
  }

  return { toasts, error, success, info, fromError, dismiss };
}
