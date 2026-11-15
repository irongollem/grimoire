import { onScopeDispose } from "vue";
import { onStorageFull } from "@/lib/storage";
import { useToast } from "@/composables/useToast";

/**
 * Tells the user, at the moment of an upload, that their plan's storage is used
 * up (#1182). The ceiling is a backstop and is never advertised, so the copy
 * carries no number, no plan name and no upgrade pitch. Mount once, in App.vue.
 */
export function useStorageFullNotice(): void {
  const toast = useToast();
  const off = onStorageFull((kind) => {
    toast.error(
      kind === "pictures"
        ? "You've used the picture storage for your plan. Flatten a painting or remove pictures you no longer need to make room."
        : "You've used the storage for your plan. Remove files you no longer need to make room.",
    );
  });
  onScopeDispose(off);
}
