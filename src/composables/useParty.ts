import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { PartyMember, PartyMemberInsert, PartyMemberUpdate } from '@/types/party.types'

const QUERY_KEY = 'party'

async function fetchParty(): Promise<PartyMember[]> {
  const { data, error } = await supabase
    .from('party_members')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data as PartyMember[]
}

async function createPartyMember(member: PartyMemberInsert): Promise<PartyMember> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('party_members')
    .insert({ ...member, user_id: user!.id })
    .select()
    .single()
  if (error) throw error
  return data as PartyMember
}

async function updatePartyMember(id: string, update: PartyMemberUpdate): Promise<PartyMember> {
  const { data, error } = await supabase
    .from('party_members')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as PartyMember
}

async function deletePartyMember(id: string): Promise<void> {
  const { error } = await supabase.from('party_members').delete().eq('id', id)
  if (error) throw error
}

export function useParty() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchParty })
}

export function useCreatePartyMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPartyMember,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}

export function useUpdatePartyMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: PartyMemberUpdate }) =>
      updatePartyMember(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}

export function useDeletePartyMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deletePartyMember,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}
