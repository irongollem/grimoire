import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { ScriptoriumDocument, ScriptoriumDocInsert, ScriptoriumDocUpdate } from '@/types/scriptorium.types'

const QUERY_KEY = 'scriptorium'

async function fetchDocuments(): Promise<ScriptoriumDocument[]> {
  const { data, error } = await supabase
    .from('scriptorium_documents')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data as ScriptoriumDocument[]
}

async function fetchDocument(id: string): Promise<ScriptoriumDocument> {
  const { data, error } = await supabase
    .from('scriptorium_documents')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as ScriptoriumDocument
}

async function createDocument(doc: ScriptoriumDocInsert): Promise<ScriptoriumDocument> {
  const { data, error } = await supabase
    .from('scriptorium_documents')
    .insert(doc)
    .select()
    .single()
  if (error) throw error
  return data as ScriptoriumDocument
}

async function updateDocument(id: string, update: ScriptoriumDocUpdate): Promise<ScriptoriumDocument> {
  const { data, error } = await supabase
    .from('scriptorium_documents')
    .update(update)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ScriptoriumDocument
}

async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from('scriptorium_documents').delete().eq('id', id)
  if (error) throw error
}

export function useScriptoriumDocuments() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchDocuments })
}

export function useScriptoriumDocument(id: string) {
  return useQuery({ queryKey: [QUERY_KEY, id], queryFn: () => fetchDocument(id) })
}

export function useCreateScriptoriumDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}

export function useUpdateScriptoriumDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: ScriptoriumDocUpdate }) =>
      updateDocument(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] })
    },
  })
}

export function useDeleteScriptoriumDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  })
}
