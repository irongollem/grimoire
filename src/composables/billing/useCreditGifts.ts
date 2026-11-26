import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useSubscription } from "@/composables/billing/useSubscription";

export interface CreditGift {
  id: string;
  credits: number;
  message: string | null;
  created_at: string;
}

const QUERY_KEY = ["credit-gifts"] as const;

/**
 * Credits the admin gave this account that its owner has not yet been told
 * about, oldest first, and `markSeen` to put them away. A gift is written by
 * `admin_grant_credits` (20261125233731); the owner may only set `seen_at`.
 *
 * Read only when the subscription row, which every boot reads anyway, says some
 * are unseen (`unseen_credit_gifts`, 20261126005354): most accounts never get a
 * gift, so the dialog costs them no request. A gift is account-level, so it has
 * no campaign doorbell to ring, and it can wait for the next visit.
 */
export function useCreditGifts() {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  const queryClient = useQueryClient();
  const { subscription } = useSubscription();
  const anyUnseen = computed(() => (subscription.value?.unseen_credit_gifts ?? 0) > 0);

  const query = useQuery({
    queryKey: computed(() => [...QUERY_KEY, userId.value] as const),
    queryFn: async ({ queryKey: [, uid] }) => {
      if (!uid) return [] as CreditGift[];
      const { data, error } = await supabase
        .from("credit_gifts")
        .select("id, credits, message, created_at")
        .eq("user_id", uid)
        .is("seen_at", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((g) => ({ ...g, credits: Number(g.credits) })) as CreditGift[];
    },
    enabled: computed(() => !!userId.value && anyUnseen.value),
  });

  const gifts = computed(() => query.data.value ?? []);
  const total = computed(() => gifts.value.reduce((sum, g) => sum + g.credits, 0));

  const { mutate } = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!userId.value) throw new Error("You must be signed in.");
      const { error } = await supabase
        .from("credit_gifts")
        .update({ seen_at: new Date().toISOString() })
        .eq("user_id", userId.value)
        .in("id", ids);
      if (error) throw error;
    },
    // Close at once; the write catches up in the background.
    onMutate: (ids: string[]) => {
      queryClient.setQueryData<CreditGift[]>([...QUERY_KEY, userId.value], (prev) =>
        (prev ?? []).filter((g) => !ids.includes(g.id)),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });

  return {
    gifts,
    total,
    markSeen: () => {
      const ids = gifts.value.map((g) => g.id);
      if (ids.length) mutate(ids);
    },
  };
}
