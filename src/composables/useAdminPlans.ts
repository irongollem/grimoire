import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { supabase } from '@/lib/supabase'
import type { Plan, QUOTA_RESOURCE_LABELS } from '@/types/subscription.types'
import { QUOTA_RESOURCE_LABELS as LABELS } from '@/types/subscription.types'

export type { QUOTA_RESOURCE_LABELS }

async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from('plans').select('*').order('id')
  if (error) throw error
  return (data ?? []) as Plan[]
}

export function useAdminPlans() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: fetchPlans,
    staleTime: 30_000,
  })

  const updateQuotas = useMutation({
    mutationFn: async ({ planId, quotas }: { planId: string; quotas: Record<string, number> }) => {
      const { error } = await supabase
        .from('plans')
        .update({ quotas })
        .eq('id', planId)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  })

  return { ...query, updateQuotas, LABELS }
}
