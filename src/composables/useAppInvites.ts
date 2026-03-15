import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

const QUERY_KEY = "app-invites";

export interface AppInvite {
  id: string;
  token: string;
  label: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
}

export type AppInviteInsert = Partial<Pick<AppInvite, "label" | "expires_at" | "max_uses">>;

async function fetchAppInvites(): Promise<AppInvite[]> {
  const { data, error } = await supabase
    .from("app_invites")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as AppInvite[];
}

async function createAppInvite(invite: AppInviteInsert): Promise<AppInvite> {
  const { data, error } = await supabase
    .from("app_invites")
    .insert(invite)
    .select()
    .single();
  if (error) throw error;
  return data as AppInvite;
}

async function deleteAppInvite(id: string): Promise<void> {
  const { error } = await supabase.from("app_invites").delete().eq("id", id);
  if (error) throw error;
}

export function useAppInvites() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchAppInvites,
  });
}

export function useCreateAppInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAppInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeleteAppInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAppInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
