import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";

export { CHILD_ACCOUNT_COLUMNS, isActiveChildLink } from "@/lib/childAccount";
export type { ChildAccountLink } from "@/types/childAccount.types";

/**
 * Whether the signed-in account is a parent-managed child account.
 *
 * A thin reader over `useAuthStore().childLink` / `.isChildAccount`, not its
 * own `useQuery` any more: those refs are loaded on the store alongside
 * membership/username (sign-in, session restore, every auth state change),
 * because `useCampaignStore().isAiEnabled` needed this fact from a plain
 * Pinia computed, which cannot open a TanStack query (no injection context
 * outside a mounted app — see the store's own docblock on `isChildAccount`).
 *
 * `isLoading` mirrors the old query's semantics for an authenticated caller:
 * true until the store's first `loadChildLink` call resolves, then false —
 * except it stays true forever across a *failed* first load rather than
 * settling on a false negative, matching `childLinkLoaded`'s own contract.
 * `refetch` re-runs that load for the current user and is safe to call
 * whether or not one is signed in.
 *
 * This is presentation only: it hides what a child account cannot use. The
 * boundary is the server (`private.is_child_account` behind the spend gate and
 * `is_user_pro`, and the edge functions' account gate), so a stale `false` here
 * shows a button that then refuses, never a feature that works.
 */
export function useChildAccount() {
  const auth = useAuthStore();

  const link = computed(() => auth.childLink);
  const isChild = computed(() => auth.isChildAccount);
  const isLoading = computed(() => auth.isAuthenticated && !auth.childLinkLoaded);

  function refetch() {
    const userId = auth.user?.id;
    return userId ? auth.loadChildLink(userId) : Promise.resolve();
  }

  return { link, isChild, isLoading, refetch };
}
