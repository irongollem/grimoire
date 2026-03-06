import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { Monster, MonsterInsert, MonsterUpdate } from '@/types/monster.types'

const QUERY_KEY = 'monsters'

async function fetchMonsters(): Promise<Monster[]> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data as Monster[]
}

async function fetchMonster(id: string): Promise<Monster> {
  const { data, error } = await supabase
    .from('monsters')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Monster
}

async function createMonster(monster: MonsterInsert): Promise<Monster> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('monsters')
    .insert({ ...monster, user_id: user!.id })
    .select()
    .single()
  if (error) throw error
  return data as Monster
}

async function updateMonster(id: string, update: MonsterUpdate): Promise<Monster> {
  const { data, error } = await supabase
    .from('monsters')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Monster
}

async function deleteMonster(id: string): Promise<void> {
  const { error } = await supabase.from('monsters').delete().eq('id', id)
  if (error) throw error
}

export function useMonsters() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchMonsters })
}

export function useMonster(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => fetchMonster(id),
    enabled: !!id,
  })
}

export function useCreateMonster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}

export function useUpdateMonster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MonsterUpdate }) =>
      updateMonster(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] })
    },
  })
}

export function useDeleteMonster() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}
