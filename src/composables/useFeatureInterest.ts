import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { FeatureInterest } from "@/types/mini.types";

const UNIQUE_VIOLATION = "23505";

/** Whether the current user has already registered interest in `feature`. */
export function useMyFeatureInterest(feature: string) {
  const user = getCurrentUser();
  return useQuery({
    queryKey: ["feature-interest", "mine", feature],
    queryFn: async (): Promise<FeatureInterest | null> => {
      const { data, error } = await supabase
        .from("feature_interest")
        .select("id, user_id, feature, created_at")
        .eq("feature", feature)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as FeatureInterest | null;
    },
    enabled: () => !!user,
  });
}

/** Record a "notify me" click. Idempotent — a repeat click (unique violation) is a no-op success. */
export function useRegisterFeatureInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (feature: string): Promise<void> => {
      const user = getCurrentUser();
      if (!user) throw new Error("You must be signed in.");
      const { error } = await supabase
        .from("feature_interest")
        .insert({ feature, user_id: user.id });
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },
    onSuccess: (_data, feature) => {
      queryClient.invalidateQueries({ queryKey: ["feature-interest", "mine", feature] });
      queryClient.invalidateQueries({ queryKey: ["feature-interest", "count", feature] });
    },
  });
}

/** Admin: total number of users who've registered interest in `feature` — the buy-signal counter. */
export function useFeatureInterestCount(feature: string) {
  return useQuery({
    queryKey: ["feature-interest", "count", feature],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("feature_interest")
        .select("id", { count: "exact", head: true })
        .eq("feature", feature);
      if (error) throw error;
      // A head-count with no error always carries a number; a null here means
      // the request silently failed — surface it, don't report "0 interest".
      if (count === null) throw new Error("Interest count unavailable");
      return count;
    },
    staleTime: 60_000,
  });
}
