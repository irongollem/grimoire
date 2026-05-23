import { ref, computed } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import type { PatreonConnection } from "@/types/subscription.types";

async function fetchConnection(): Promise<PatreonConnection | null> {
  const { data } = await supabase
    .from("patreon_connections")
    .select("user_id, patreon_user_id, patreon_email, full_name, token_expires_at, created_at, updated_at")
    .maybeSingle();
  return data as PatreonConnection | null;
}

export function usePatreon() {
  const auth = useAuthStore();
  const queryClient = useQueryClient();
  const loading = ref(false);
  const error = ref<string | null>(null);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["patreon-connection"],
    queryFn: fetchConnection,
    staleTime: 60_000,
    enabled: computed(() => !!auth.user),
  });

  const isLinked = computed(() => !!connection.value);

  async function startOAuth() {
    loading.value = true;
    error.value = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/patreon-link-url`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "Failed to get Patreon URL");
      window.location.href = json.url;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Something went wrong";
      loading.value = false;
    }
  }

  async function disconnect() {
    loading.value = true;
    error.value = null;
    try {
      const { error: dbErr } = await supabase
        .from("patreon_connections")
        .delete()
        .eq("user_id", auth.user!.id);
      if (dbErr) throw dbErr;

      // Revert subscription to free if still on Patreon billing
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("subscription_provider")
        .maybeSingle();
      if (sub?.subscription_provider === "patreon") {
        await supabase.from("user_subscriptions").update({
          plan_id: "free",
          status: "active",
          subscription_provider: "stripe",
          patreon_member_id: null,
        }).eq("user_id", auth.user!.id);
      }

      queryClient.invalidateQueries({ queryKey: ["patreon-connection"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Something went wrong";
    } finally {
      loading.value = false;
    }
  }

  return { connection, isLinked, isLoading, loading, error, startOAuth, disconnect };
}
