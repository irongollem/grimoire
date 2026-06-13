import { ref } from "vue";

export type ToastType = "error" | "success" | "info";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  /** Auto-dismiss delay in ms; 0 keeps it until manually dismissed. */
  duration: number;
}

// Module-level singleton so every caller shares one stack (same pattern as
// useConfirm). The <ToastHost> mounted once in App.vue renders `toasts`.
const toasts = ref<Toast[]>([]);
let nextId = 0;

function push(type: ToastType, message: string, duration: number): number {
  const id = ++nextId;
  toasts.value = [...toasts.value, { id, type, message, duration }];
  return id;
}

function dismiss(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

export function useToast() {
  /** Error toast — sticks around longer since the user needs to read/act on it. */
  function error(message: string, duration = 7000) {
    return push("error", message, duration);
  }
  function success(message: string, duration = 3500) {
    return push("success", message, duration);
  }
  function info(message: string, duration = 4500) {
    return push("info", message, duration);
  }
  /** Normalise an unknown thrown value into a human-readable message. */
  function fromError(e: unknown, fallback = "Something went wrong."): string {
    if (e instanceof Error && e.message) return e.message;
    if (typeof e === "string" && e) return e;
    return fallback;
  }

  return { toasts, error, success, info, fromError, dismiss };
}
