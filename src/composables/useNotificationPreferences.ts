import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useToast } from "@/composables/useToast";

const QUERY_KEY = "notification_preferences";

export interface NotificationPreferences {
  email_shared_notes: boolean;
  email_session_proposals: boolean;
}

/**
 * Mirrors the server: no notification_preferences row means everything is ON.
 * The row is only created on the first toggle, so the table never needs
 * backfilling for existing accounts.
 */
export const NOTIFICATION_PREFERENCE_DEFAULTS: NotificationPreferences = {
  email_shared_notes: true,
  email_session_proposals: true,
};

async function fetchPreferences(): Promise<NotificationPreferences> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("email_shared_notes, email_session_proposals")
    .eq("user_id", user!.id)
    .maybeSingle();
  if (error) throw error;
  return (data as NotificationPreferences | null) ?? NOTIFICATION_PREFERENCE_DEFAULTS;
}

async function upsertPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const user = getCurrentUser();
  const current = await fetchPreferences();
  const next = { ...current, ...patch };
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user!.id, ...next }, { onConflict: "user_id" })
    .select("email_shared_notes, email_session_proposals")
    .single();
  if (error) throw error;
  return data as NotificationPreferences;
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchPreferences,
    enabled: () => !!getCurrentUser(),
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: upsertPreferences,
    onSuccess: (prefs) => {
      queryClient.setQueryData([QUERY_KEY], prefs);
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}
