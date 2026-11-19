import { toast } from "@/lib/toast";

/** The app's toasts, for a component or a composable (`src/lib/toast.ts` holds the one stack). */
export function useToast() {
  return toast;
}
