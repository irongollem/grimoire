import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

/**
 * Who has been granted a feature that is released to chosen accounts only (#1021; `feature_access`). The admin's
 * side: every grant of the AI table, and giving or taking one. The policies let only an app admin write, and an
 * admin read every row; everyone else's read of this returns only what concerns them.
 */
const KEY = ["admin-feature-grants", "ai_table"] as const;

export function useTableGrants() {
  const qc = useQueryClient();
  const auth = useAuthStore();
  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("feature_access").select("user_id").eq("feature", "ai_table");
      if (error) throw error;
      return data.map((row) => row.user_id as string);
    },
  });
  const granted = computed(() => new Set(query.data.value ?? []));

  const { mutateAsync: setGrant, isPending: saving } = useMutation({
    mutationFn: async ({ userId, on }: { userId: string; on: boolean }) => {
      if (on) {
        const by = auth.user?.id;
        if (!by) throw new Error("Not signed in.");
        const { error } = await supabase.from("feature_access").upsert({ user_id: userId, feature: "ai_table", granted_by: by });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("feature_access").delete().eq("user_id", userId).eq("feature", "ai_table");
        if (error) throw error;
      }
    },
    // The grant decides what that account's pages show: both the admin's list and any cached answer are refreshed.
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ["feature-access"] })]),
  });

  return { granted, setGrant, saving, loaded: computed(() => query.data.value !== undefined) };
}
