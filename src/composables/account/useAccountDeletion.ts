import { ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { functionErrorCode } from "@/lib/functionError";
import { useAuthStore } from "@/stores/auth";

/** `delete-account` edge function error codes (#631) -> human copy. */
const ERROR_MESSAGES: Record<string, string> = {
  confirm_required: "Type DELETE exactly to confirm.",
  cannot_delete_admin: "Admin accounts can't be deleted this way.",
  user_not_found: "That account could not be found.",
  storage_purge_failed: "Some of your data could not be purged. Contact support before trying again.",
  erasure_preparation_failed: "Account deletion failed. Please try again or contact support.",
  deletion_failed: "Account deletion failed. Please try again or contact support.",
};

/** Maps a `delete-account` error code to human copy; an unrecognised code passes through verbatim. */
export function accountDeletionErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

/**
 * Invokes the `delete-account` edge function, resolving on `{ ok: true }` and
 * throwing an `Error` whose `.message` is the server's error code otherwise.
 * Shared by `useAccountDeletion` (self-service) and `useAdminUsers.deleteUser`
 * (admin). The `functions.invoke` payload-extraction quirk it used to spell out
 * here now lives in `@/lib/functionError` — this file claimed to be its single
 * owner while two other call sites held their own copies.
 */
export async function invokeDeleteAccount(targetUserId?: string): Promise<void> {
  const body: { confirm: "DELETE"; targetUserId?: string } = { confirm: "DELETE" };
  if (targetUserId) body.targetUserId = targetUserId;

  const { data, error } = await supabase.functions.invoke("delete-account", { body });
  if (error) throw new Error(await functionErrorCode(error));
  if (data?.error) throw new Error(data.error);
}

/**
 * GDPR self-service account deletion (#631). Self-deletion (`targetUserId`
 * omitted) signs the user out and sends them to the login screen the instant
 * the edge function confirms — their session is dead server-side by then.
 * Admin deletion of another account just resolves; `useAdminUsers.deleteUser`
 * owns refreshing the admin list.
 */
export function useAccountDeletion() {
  const deleting = ref(false);
  const error = ref<string | null>(null);
  const router = useRouter();
  const auth = useAuthStore();

  async function deleteAccount(targetUserId?: string): Promise<boolean> {
    deleting.value = true;
    error.value = null;
    try {
      await invokeDeleteAccount(targetUserId);
      if (!targetUserId) {
        await auth.signOut();
        await router.push({ name: "login" });
      }
      return true;
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      error.value = accountDeletionErrorMessage(code);
      return false;
    } finally {
      deleting.value = false;
    }
  }

  return { deleting, error, deleteAccount };
}
