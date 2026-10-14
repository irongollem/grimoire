import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useToast } from "@/composables/useToast";

const QUERY_KEY = "notification_preferences";

export interface NotificationPreferences {
  email_session_proposals: boolean;
  email_product_news: boolean;
}

/**
 * Mirrors the server: no notification_preferences row means the transactional
 * emails are ON and product news is OFF (news is opt-in). The row is only
 * created on the first toggle, so the table never needs backfilling. The
 * consent timestamp is stamped by a server trigger and never read or written here.
 */
export const NOTIFICATION_PREFERENCE_DEFAULTS: NotificationPreferences = {
  email_session_proposals: true,
  email_product_news: false,
};

async function fetchPreferences(): Promise<NotificationPreferences> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("email_session_proposals, email_product_news")
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
    .select("email_session_proposals, email_product_news")
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
