import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { Npc, NpcInsert, NpcUpdate } from '@/types/npc.types'

const QUERY_KEY = 'npcs'

async function fetchNpcs(): Promise<Npc[]> {
  const { data, error } = await supabase
    .from('npcs')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data as Npc[]
}

async function fetchNpc(id: string): Promise<Npc> {
  const { data, error } = await supabase
    .from('npcs')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Npc
}

async function createNpc(npc: NpcInsert): Promise<Npc> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('npcs')
    .insert({ ...npc, user_id: user!.id })
    .select()
    .single()
  if (error) throw error
  return data as Npc
}

async function updateNpc(id: string, update: NpcUpdate): Promise<Npc> {
  const { data, error } = await supabase
    .from('npcs')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Npc
}

async function deleteNpc(id: string): Promise<void> {
  const { error } = await supabase.from('npcs').delete().eq('id', id)
  if (error) throw error
}

export function useNpcs() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchNpcs })
}

export function useNpc(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => fetchNpc(id),
    enabled: !!id,
  })
}

export function useCreateNpc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createNpc,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}

export function useUpdateNpc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: NpcUpdate }) =>
      updateNpc(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] })
    },
  })
}

export function useDeleteNpc() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteNpc,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}
