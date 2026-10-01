import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { ANNOUNCEMENTS, pendingAnnouncements } from "@/lib/announcements";

const QUERY_KEY = ["announcement-dismissals"] as const;
const UNIQUE_VIOLATION = "23505";

/**
 * The next announcement this account has not dismissed (or null), and
 * `dismiss` to put it away for good. Dismissals are per account, stored in
 * `announcement_dismissals`.
 */
export function useAnnouncements() {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: computed(() => [...QUERY_KEY, userId.value] as const),
    queryFn: async ({ queryKey: [, uid] }) => {
      if (!uid) return [] as string[];
      const { data, error } = await supabase
        .from("announcement_dismissals")
        .select("announcement_id")
        .eq("user_id", uid);
      if (error) throw error;
      return (data ?? []).map((r) => r.announcement_id as string);
    },
    enabled: computed(() => !!userId.value),
    retry: false,
  });

  const current = computed(() => {
    // Until the dismissals have loaded, show nothing rather than flash a
    // notice the user already dismissed.
    if (!query.isSuccess.value) return null;
    const pending = pendingAnnouncements(
      ANNOUNCEMENTS,
      new Set(query.data.value ?? []),
      auth.user?.created_at,
    );
    return pending[0] ?? null;
  });

  const { mutate } = useMutation({
    mutationFn: async (announcementId: string) => {
      if (!userId.value) throw new Error("You must be signed in.");
      const { error } = await supabase
        .from("announcement_dismissals")
        .insert({ user_id: userId.value, announcement_id: announcementId });
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },
    // Hide it at once; the insert catches up in the background.
    onMutate: (announcementId: string) => {
      queryClient.setQueryData<string[]>([...QUERY_KEY, userId.value], (prev) => [...(prev ?? []), announcementId]);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  return { current, dismiss: (id: string) => mutate(id) };
}
