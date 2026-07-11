import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { EntityNote } from "@/types/faction.types";

export function useEntityNotes(entityType: MaybeRefOrGetter<string>, entityId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ["entity-notes", toValue(entityType), toValue(entityId)]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_notes")
        .select("*")
        .eq("entity_type", toValue(entityType))
        .eq("entity_id", toValue(entityId))
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as EntityNote[];
    },
    enabled: () => !!toValue(entityId),
  });
}

export function useCreateEntityNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      entity_type: string;
      entity_id: string;
      content: string;
      is_private: boolean;
      shared_with_dm?: boolean;
      campaign_id?: string | null;
    }) => {
      const user = getCurrentUser();
      const { data, error } = await supabase
        .from("entity_notes")
        .insert({ ...payload, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as EntityNote;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["entity-notes", vars.entity_type, vars.entity_id] }),
  });
}

export function useUpdateEntityNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      content,
      is_private,
      shared_with_dm,
      entity_type: _et,
      entity_id: _ei,
    }: {
      id: string;
      content: string;
      is_private: boolean;
      shared_with_dm?: boolean;
      entity_type: string;
      entity_id: string;
    }) => {
      const { error } = await supabase
        .from("entity_notes")
        .update({ content, is_private, ...(shared_with_dm !== undefined && { shared_with_dm }) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["entity-notes", vars.entity_type, vars.entity_id] }),
  });
}

export function useDeleteEntityNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      entity_type: _et,
      entity_id: _ei,
    }: {
      id: string;
      entity_type: string;
      entity_id: string;
    }) => {
      const { error } = await supabase.from("entity_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["entity-notes", vars.entity_type, vars.entity_id] }),
  });
}
